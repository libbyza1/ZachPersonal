# assets/icons

SVG icons for the dashboard UI.  Place icon files here and reference them
with relative paths from `index.html` or via CSS `url()`.

## Why SVGs instead of PNGs?

| Concern     | PNG                       | SVG                         |
|-------------|---------------------------|-----------------------------|
| Sharpness   | Blurry at non-native DPI  | Crisp at any size/resolution|
| File size   | 10–50 KB for action icons | 0.5–5 KB per icon           |
| CSS styling | Not possible              | Color, size controlled by CSS|
| Animation   | No                        | Yes (CSS/SMIL)              |

## Naming convention

Use lowercase kebab-case.  If a light/dark variant is needed, suffix with
`-light` or `-dark`:

```
icon-filter.svg
icon-download.svg
icon-settings.svg
icon-close.svg
icon-question.svg
icon-user.svg
icon-192.png   ← PWA manifest icon (192 × 192, raster required by spec)
icon-512.png   ← PWA manifest icon (512 × 512, raster required by spec)
```

## Usage in HTML

```html
<!-- Inline SVG (preferred — styleable with CSS) -->
<svg class="icon" aria-hidden="true" focusable="false">
    <use href="assets/icons/sprite.svg#icon-download"></use>
</svg>

<!-- Img tag (simpler, but loses CSS styling) -->
<img src="assets/icons/icon-download.svg" alt="" aria-hidden="true">
```

## Migrating existing PNGs

The following PNG images in `assets/images/` are candidates for SVG replacement:

| Current file        | Suggested SVG replacement                    |
|---------------------|----------------------------------------------|
| Cancel.png          | Standard × close icon                        |
| Download.png        | Arrow-down-to-disk icon                      |
| Settings.png        | Gear/cog icon                                |
| Question.png        | Circle-? info icon                           |
| User.png            | Person silhouette icon                       |
| ViewTheData.png     | Table/chart icon                             |
| BackBlack.png       | Chevron-left (black)                         |
| BackBlue.png        | Chevron-left (blue)                          |
| DashboardActive*.png| Sidebar nav icons — convert to SVG sprite    |

Logos (ST_logo.png, Alcon_R.png) remain as PNG/WebP since they are brand
assets that must match the approved colour exactly and are not styled via CSS.
