# assets/fonts

Local font files for offline / network-restricted enterprise deployments.

## Why local fonts?

CDN fonts (Google Fonts) are convenient but introduce:
- **Latency** on first render (extra DNS + TCP round-trip)
- **Privacy risk** — Google receives the end-user's IP address
- **Offline failure** — dashboards open on air-gapped machines show the
  fallback font (`Segoe UI`) instead of `Open Sans`

## Setup

1. Download the required weights from [Google Fonts](https://fonts.google.com/specimen/Open+Sans)
   or use `fontsource` NPM packages.

2. Place `.woff2` files here with this naming pattern:
   ```
   fonts/
   ├── open-sans-300.woff2
   ├── open-sans-400.woff2
   ├── open-sans-400-italic.woff2
   ├── open-sans-600.woff2
   └── open-sans-700.woff2
   ```

3. Add `@font-face` declarations to `assets/tokens/tokens.css`:
   ```css
   @font-face {
       font-family: 'Open Sans';
       font-style:  normal;
       font-weight: 400;
       font-display: swap;
       src: url('../fonts/open-sans-400.woff2') format('woff2');
   }
   /* repeat for 300, 600, 700, italic */
   ```

4. Remove the Google Fonts `<link>` tags from `index.html`.

## Current status

No external font stylesheet is loaded. The dashboard uses its system font fallback. Add approved local
font files when exact typography is required; do not introduce a required external font dependency.
