// ==UserScript==
// @name         Bragðlaukar – vika og dagur í fókus
// @namespace    bragdlaukar-focus
// @version      1.0.0
// @description  Á bragdlaukar.is/matsedill: deyfir allar vikur nema þá sem er í gangi núna, og opnar matseðilinn á deginum í dag.
// @author       you
// @match        https://www.bragdlaukar.is/matsedill*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // true  = deyfa/blurra aðrar vikur (með hnapp til að sýna þær tímabundið)
  // false = fela aðrar vikur alveg (display:none)
  const DIM_INSTEAD_OF_HIDE = true;

  // Hversu oft og hversu lengi skal reyna, enda getur Webflow hlaðið
  // "day" sleðanum (slider dots) inn með smá töf eftir að síðan birtist.
  const RETRY_WINDOW_MS = 8000;

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5,
    jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11,
  };

  function normalize(s) {
    return s
      .toLowerCase()
      .replace(/á/g, 'a').replace(/ð/g, 'd').replace(/é/g, 'e')
      .replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/ý/g, 'y').replace(/þ/g, 'th').replace(/æ/g, 'ae')
      .replace(/ö/g, 'o');
  }

  function monthIndex(word) {
    if (!word) return null;
    const key = normalize(word).slice(0, 3);
    return key in MONTHS ? MONTHS[key] : null;
  }

  // Les t.d. "Vikan 2.-6. nóvember" eða "Vikan 30. nóvember - 4. desember"
  // og skilar {startDate, endDate} fyrir þá viku.
  function parseWeekHeading(text, today) {
    const m = text.match(/Vikan\s+(.*)/i);
    if (!m) return null;

    const parts = m[1].split('-').map((s) => s.trim());
    if (parts.length !== 2) return null;

    const dayRe = /(\d{1,2})\.?\s*([A-Za-zÁÐÉÍÓÚÝÞÆÖáðéíóúýþæö]+)?/;
    const startMatch = parts[0].match(dayRe);
    const endMatch = parts[1].match(dayRe);
    if (!startMatch || !endMatch) return null;

    const endDay = parseInt(endMatch[1], 10);
    const endMonth = monthIndex(endMatch[2]);
    if (endMonth === null) return null;

    const startDay = parseInt(startMatch[1], 10);
    const startMonth = monthIndex(startMatch[2]) ?? endMonth;

    const oneDay = 24 * 60 * 60 * 1000;

    // Giska á ár út frá "í dag" og leiðrétta yfir áramót.
    let year = today.getFullYear();
    let endDate = new Date(year, endMonth, endDay, 23, 59, 59, 999);
    if (endDate - today > 200 * oneDay) year -= 1;
    else if (today - endDate > 200 * oneDay) year += 1;
    endDate = new Date(year, endMonth, endDay, 23, 59, 59, 999);

    let startYear = year;
    if (startMonth > endMonth) startYear -= 1; // t.d. "30. des - 3. jan"
    const startDate = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);

    return { startDate, endDate };
  }

  function pickCurrentWeek(weeks, today) {
    const withRange = weeks.filter((w) => w.range);

    const exact = withRange.find(
      (w) => today >= w.range.startDate && today <= w.range.endDate
    );
    if (exact) return exact;

    // Engin vika í gangi núna (t.d. helgi) -> taka næstu komandi viku.
    const upcoming = withRange
      .filter((w) => w.range.startDate > today)
      .sort((a, b) => a.range.startDate - b.range.startDate)[0];
    if (upcoming) return upcoming;

    // Allar vikur liðnar -> taka þá nýjustu.
    const past = withRange.sort((a, b) => b.range.endDate - a.range.endDate)[0];
    return past || weeks[0];
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .blf-other-week {
        position: relative;
      }
      .blf-other-week.blf-dim {
        filter: blur(5px);
        opacity: 0.4;
        pointer-events: none;
        user-select: none;
        transition: filter 0.2s ease, opacity 0.2s ease;
      }
      .blf-other-week.blf-hidden {
        display: none !important;
      }
      .blf-reveal-btn {
        position: sticky;
        top: 12px;
        z-index: 1000;
        display: block;
        margin: 12px auto;
        padding: 8px 16px;
        font-size: 14px;
        font-family: inherit;
        background: #111;
        color: #fff;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        pointer-events: auto;
        opacity: 1 !important;
        filter: none !important;
        width: fit-content;
      }
    `;
    document.head.appendChild(style);
  }

  function addRevealButton(mainEl) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blf-reveal-btn';
    btn.textContent = 'Sýna þessa viku';
    btn.addEventListener('click', () => {
      const dimmed = mainEl.classList.contains('blf-dim');
      if (dimmed) {
        mainEl.classList.remove('blf-dim');
        btn.textContent = 'Fela þessa viku aftur';
      } else {
        mainEl.classList.add('blf-dim');
        btn.textContent = 'Sýna þessa viku';
      }
    });
    mainEl.prepend(btn);
  }

  function jumpToToday(mainEl, today) {
    const day = today.getDay(); // 0 sunnudagur ... 6 laugardagur
    const index = day - 1; // mánudagur=0 ... föstudagur=4
    if (index < 0 || index > 4) return; // helgi: láta sleðann vera á mánudegi (default)

    const slider = mainEl.querySelector('.slider.w-slider');
    if (!slider) return;

    const tryClick = () => {
      const dots = slider.querySelectorAll('.w-slider-nav .w-slider-dot');
      if (dots.length > index) {
        dots[index].click();
        return true;
      }
      return false;
    };

    if (tryClick()) return;

    const observer = new MutationObserver(() => {
      if (tryClick()) observer.disconnect();
    });
    observer.observe(slider, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), RETRY_WINDOW_MS);
  }

  function run() {
    const mains = Array.from(document.querySelectorAll('main.main-wrapper'));
    if (mains.length === 0) return;
    if (mains.length === 1) {
      jumpToToday(mains[0], new Date());
      return;
    }

    injectStyles();

    const today = new Date();
    const weeks = mains.map((el) => {
      const heading = Array.from(el.querySelectorAll('h2')).find((h) =>
        /Vikan/i.test(h.textContent)
      );
      const range = heading ? parseWeekHeading(heading.textContent.trim(), today) : null;
      return { el, range };
    });

    const current = pickCurrentWeek(weeks, today);

    weeks.forEach((w) => {
      if (w === current) return;
      w.el.classList.add('blf-other-week');
      if (DIM_INSTEAD_OF_HIDE) {
        w.el.classList.add('blf-dim');
        addRevealButton(w.el);
      } else {
        w.el.classList.add('blf-hidden');
      }
    });

    if (current) jumpToToday(current.el, today);
  }

  window.addEventListener('load', () => setTimeout(run, 300));
})();
