# someday.

A local-first React + Vite prototype for a Chrome new-tab countdown dashboard. The app stores your settings in this browser only; there is no account or backend.

## Run it

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints (usually `http://localhost:5173`).
4. For a production build, run `npm run build`; `npm run preview` serves that build locally.

## About the numbers

Country and sex categories are rounded, offline reference values for life expectancy at birth, aligned to the UN World Population Prospects 2024 (2023 estimate) country tables. The app lets you edit the baseline. The dashboard subtracts age in whole years from that baseline as a simple countdown convention; it is **not** a conditional life-table estimate for a person who has already reached their current age, nor a personal prediction. The interface explains this distinction. The table covers a selection of countries and uses a sex category only to select a population statistic. The app does not infer gender identity.

Source: [UN World Population Prospects 2024](https://population.un.org/wpp/). Country figures are rounded for the prototype; use the source data and review exact values before shipping a public extension.

## Chrome new-tab starting point

The Vite production output is a static site and can be hosted or adapted into an extension. To make an installable extension, add a Manifest V3 `manifest.json` with `chrome_url_overrides.newtab` pointing at the built entry page, then package the build output. This prototype does not request Chrome permissions.
