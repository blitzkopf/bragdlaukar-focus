# bragdlaukar-focus

A Tampermonkey userscript for [bragdlaukar.is/matsedill](https://www.bragdlaukar.is/matsedill) that fixes two annoyances with the page:

1. **Multiple weeks shown at once** – the page stacks several weeks' menus on top of each other. The script figures out which week is the current one (based on the "Vikan X.-Y. mánuður" heading) and blurs/dims the others, with a small button to reveal them again if you want to peek ahead.
2. **Day picker doesn't default to today** – each week's menu is a weekday slider that always opens on Monday. The script clicks the slider forward to today's weekday automatically.

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the Tampermonkey dashboard → "Create a new script".
3. Delete the placeholder content and paste in the contents of [`bragdlaukar-focus.user.js`](./bragdlaukar-focus.user.js).
4. Save, then visit the [matseðill page](https://www.bragdlaukar.is/matsedill).

## Configuration

At the top of the script:

```js
const DIM_INSTEAD_OF_HIDE = true; // false = fully hide other weeks instead of blurring them
```

## Notes

- Weekend fallback: since the menu only has Monday–Friday slides, visiting on a Saturday/Sunday leaves the slider on Monday and highlights the upcoming week as "current".
- The week-heading date parsing handles both same-month ranges (`2.-6. nóvember`) and cross-month ranges (`30. nóvember - 4. desember`), guessing the year from the current date.
