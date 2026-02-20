# Ecdysis RAW Developer (Windows-focused)

Ecdysis is an open-source RAW photo developer inspired by Adobe Camera Raw. This repository now includes a desktop-oriented Electron scaffold with a filmstrip UI, adjustment engine model, snapshot/preset workflows, rating/culling metadata, and masking primitives.

## Implemented foundation

- **RAW adjustment model** for white balance, exposure, contrast, highlights/shadows, blacks/whites, saturation, vibrance, clarity, texture, dehaze, vignette, tone curves, color mixer, and color grading.
- **Snapshots** that preserve the full current adjustment state and masks.
- **Presets with selective options**, allowing users to save and reapply only selected adjustment groups.
- **Filmstrip-style multi-select workflow** where multiple images can be selected and adjusted together.
- **Copy/Paste behavior** including:
  - Copy all adjustments (`Ctrl+C`)
  - Copy selective groups (`Ctrl+Shift+C`)
  - Paste to current selection (`Ctrl+V`)
- **Rating and filtering metadata** (0–5 stars + color labels).
- **Image culling flag** (mark selected images for deletion; integration to Windows Recycle Bin can be connected in the next backend step).
- **Mask layer model** supporting linear/radial/brush mask types with local adjustments.

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
- `src/core/store.js`: High-level editor state and operations (snapshots, presets, masks, metadata, culling, copy/paste).
- `src/renderer/ui.js`: Filmstrip and control panel interactions.
- `src/main.js`: Electron desktop host window.

## Next milestones to reach full ACR parity

1. **RAW processing backend:** integrate LibRaw/OpenImageIO/rawspeed for camera-specific decoding and demosaic.
2. **GPU pipeline:** implement non-destructive 16/32-bit linear pipeline with OpenCL/Vulkan/DirectX compute.
3. **Lens/camera profiles:** parse XMP/DCP/ICC and lens correction profiles.
4. **Advanced masking:** AI subject/sky/object masks + additive/subtractive mask components.
5. **Catalog + sidecar:** robust project database and XMP sidecar compatibility.
6. **Batch export:** queue for TIFF/JPEG/PNG/DNG and color-managed output.
7. **Windows-native shell integration:** direct send-to-recycle-bin, Explorer thumbnails, and file watching.

