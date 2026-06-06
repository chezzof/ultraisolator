# Brand & Media Assets

Visual assets for Esports Isolator PRO. Palette matches the app and benchmark
HUD: background `#0A0A0A`, mint/cyan accent `#00D4AA`, light text `#E8E8EC`.

| File | Size | Use |
|------|------|-----|
| [`banner.svg`](banner.svg) | 1280x400 | README hero banner (vector, scales crisply) |
| [`social-preview.svg`](social-preview.svg) | 1280x640 | Source for the social/OG card |
| [`social-preview.png`](social-preview.png) | 1280x640 | GitHub social preview and showcase card (raster) |

## Setting the GitHub social preview

GitHub does not read the social image from the repo automatically - upload it once:

**Settings -> General -> Social preview -> Edit -> Upload an image** and choose
[`docs/social-preview.png`](social-preview.png).

This image is what renders when the repository is shared on social media,
chat apps, and community showcases.

## Regenerating the PNG from SVG

The PNG is rendered from the SVG with headless Chrome:

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,640 --screenshot=docs/social-preview.png \
  "file:///<abs-path>/docs/social-preview.svg"
```
