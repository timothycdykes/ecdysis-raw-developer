# Ecdysis RAW Developer (Windows-focused)

Ecdysis is an open-source RAW photo developer inspired by Adobe Camera Raw. This repository includes an Electron desktop scaffold with a filmstrip workflow, adjustment engine model, drag-and-drop import, center preview, zoom controls, export flow, and a right-side adjustments panel.

## Implemented foundation

- **Drag-and-drop ingest** from desktop into the app for a broad set of manufacturer RAW extensions (`.cr2`, `.cr3`, `.nef`, `.arw`, `.dng`, `.raf`, `.rw2`, `.orf`, `.pef`, `.iiq`, `.3fr`, and more) plus standard previewable image formats.
- **Filmstrip-style browser** with visual thumbnails (including RAW placeholder previews), multi-select workflow, inline star ratings, inline color labels, and deletion marking.
- **Center preview area** that displays the selected image and reflects core adjustment changes in real time (browser-level preview approximation) with fit/zoom controls and wheel zoom.
- **Right-side adjustments panel** with an ACR-inspired tabbed layout (Edit, Color, Masking, Snapshots, Metadata).
- **RAW adjustment model** for white balance, exposure, contrast, highlights/shadows, blacks/whites, saturation, vibrance, clarity, texture, dehaze, vignette, tone curves, color mixer, and color grading.
- **Snapshots** that preserve the full current adjustment state and masks.
- **Presets with selective options**, allowing users to save and reapply only selected adjustment groups.
- **Copy/Paste behavior** including:
  - Copy all adjustments (`Ctrl+C`)
  - Copy selective groups (`Ctrl+Shift+C`)
  - Paste to current selection (`Ctrl+V`)
- **Mask layer model** supporting linear/radial/brush mask types with local adjustments.
- **Image export** for selected images to rendered JPEG output.
- **Recipe export** for selected images into a JSON sidecar-like file containing adjustments and metadata.

> Current limitation: browser-native rendering cannot decode most RAW containers directly yet. RAW files are represented with generated preview cards in filmstrip/main view while full decode remains a backend milestone.


## Keyboard workflow parity upgrades

- `P` or `\` toggles edited/original preview (Before/After-style preview check).
- `Z` toggles between Fit and 100% zoom centered in the preview.
- `Ctrl/Cmd + 0` resets to Fit; `Ctrl/Cmd + +/-` zooms in/out.
- `Left/Right Arrow` moves to previous/next image in the filmstrip.
- `0–5` sets star rating (`0` clears rating).
- `6–9` sets color labels (red/yellow/green/blue), and `U` clears color label.
- `X`, `Delete`, or `Backspace` marks selected images for deletion.

## Run locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Architecture notes

- `src/core/adjustments.js`: Canonical adjustment schema + copy-group logic.
- `src/core/store.js`: High-level editor state and operations (imports, snapshots, presets, masks, metadata, copy/paste).
- `src/renderer/ui.js`: Filmstrip, drag-and-drop import, preview, and control panel interactions.
- `src/renderer/index.html` + `src/renderer/styles.css`: Three-pane editor shell (filmstrip, preview, right adjustments).
- `src/main.js`: Electron desktop host window.

## Next milestones to reach full ACR parity

1. **RAW processing backend:** integrate LibRaw/OpenImageIO/rawspeed for camera-specific decoding and demosaic.
2. **GPU pipeline:** implement non-destructive 16/32-bit linear pipeline with OpenCL/Vulkan/DirectX compute.
3. **Lens/camera profiles:** parse XMP/DCP/ICC and lens correction profiles.
4. **Advanced masking:** AI subject/sky/object masks + additive/subtractive mask components.
5. **Catalog + sidecar:** robust project database and XMP sidecar compatibility.
6. **Batch export:** queue for TIFF/JPEG/PNG/DNG and color-managed output.
7. **Windows-native shell integration:** direct send-to-recycle-bin, Explorer thumbnails, and file watching.
