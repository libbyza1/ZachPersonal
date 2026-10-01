# assets/images

Place dashboard **raster** images here (logos, photos, screenshots).
Use **relative paths only** in HTML and CSS.

> For action icons (cancel, download, settings, etc.) prefer SVG files in
> `assets/icons/` — they scale perfectly and are CSS-styleable.
> See `assets/icons/README.md` for the migration guide.

## Files included by default

| File | Origin | Notes |
|---|---|---|
| `ST_logo.png` | `Echelon - Pictures/` | Alcon / Surgical Technologies logo used in header |
| `Alcon_R.png` | `Echelon - Pictures/` | Alcon wordmark (registered trademark) |
| `BackBlack.png` / `BackBlue.png` | `Echelon - Pictures/` | Navigation back-chevron variants |
| `DashboardActive*.png` / `DashboardInactive*.png` | `Echelon - Pictures/` | Sidebar icon states |
| `Cancel.png` | `Echelon - Pictures/` | Close / cancel action icon |
| `Download.png` | `Echelon - Pictures/` | Export / download action icon |
| `Question.png` | `Echelon - Pictures/` | Help / info icon |
| `Settings.png` | `Echelon - Pictures/` | Settings / configuration icon |
| `User.png` | `Echelon - Pictures/` | User / profile icon |
| `ViewTheData.png` / `ViewTheDataBlack.png` | `Echelon - Pictures/` | Data-view action icon |
| `ST_logo_extracted.png` | `unity_dashboard.html` (extracted) | Same as ST_logo.png — from embedded base64 |

## Usage in HTML

```html
<img src="assets/images/ST_logo.png" alt="Alcon" class="header-st-logo">
```

## Usage in CSS

```css
.header {
    background-image: url('../images/BackBlue.png');
}
```

## Notes
- Keep original filenames to match existing CSS classes in `dashboard.css`.
- Add new images here and update this README accordingly.
- Do **not** embed large images as base64 in HTML — link via relative path instead.
