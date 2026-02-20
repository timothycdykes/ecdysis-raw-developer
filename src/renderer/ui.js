import { DEFAULT_ADJUSTMENTS } from "../core/adjustments.js";
import { RawDeveloperStore } from "../core/store.js";
import { isRawFile, supportsInlinePreview } from "../core/file-formats.js";
import { extractEmbeddedJpegPreviews } from "../core/raw-preview.js";
import { processPreviewPixels } from "../core/preview-renderer.js";

const CONTROL_DEFINITIONS = [
  { key: "whiteBalanceTemp", label: "Temperature", min: 2000, max: 50000, step: 100, section: "White Balance", unit: "K" },
  { key: "whiteBalanceTint", label: "Tint", min: -100, max: 100, step: 1, section: "White Balance" },
  { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05, section: "Light", unit: "EV" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, section: "Light" },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1, section: "Light" },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, section: "Light" },
  { key: "whites", label: "Whites", min: -100, max: 100, step: 1, section: "Light" },
  { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1, section: "Light" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, section: "Color" },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1, section: "Color" },
  { key: "clarity", label: "Clarity", min: -100, max: 100, step: 1, section: "Effects" },
  { key: "texture", label: "Texture", min: -100, max: 100, step: 1, section: "Effects" },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1, section: "Effects" },
  { key: "vignette", label: "Vignette", min: -100, max: 100, step: 1, section: "Effects" }
];

const store = new RawDeveloperStore([]);
const sourceImageCache = new Map();
const sourcePixelsCache = new Map();
let previewRenderToken = 0;
let scheduledPreviewFrame = null;
const zoomState = { scale: 1, pendingPan: null };
const interactionState = {
  spacePressed: false,
  panning: false,
  panStartX: 0,
  panStartY: 0,
  scrollLeft: 0,
  scrollTop: 0,
  cropMode: false,
  cropDragging: false,
  cropStartX: 0,
  cropStartY: 0,
  handTool: false
};

const COLOR_OPTIONS = ["none", "red", "yellow", "green", "blue", "purple"];
const COLOR_SWATCH = {
  none: "#697285",
  red: "#f16f6f",
  yellow: "#f9d56f",
  green: "#6ecb8f",
  blue: "#6ea8ff",
  purple: "#b891ff"
};
const COLOR_SHORTCUTS = {
  "6": "red",
  "7": "yellow",
  "8": "green",
  "9": "blue",
  "0": "purple"
};
const MIXER_CHANNELS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
const GRADE_RANGES = ["shadows", "midtones", "highlights", "global"];
const SELECTIVE_GROUP_ALIASES = {
  wb: "whiteBalance",
  whitebalance: "whiteBalance",
  white_balance: "whiteBalance",
  tone: "light",
  hsl: "mixer",
  colormixer: "mixer",
  grading: "grade",
  colorgrading: "grade",
  colourgrading: "grade",
  tonecurve: "curves"
};

const filmstripEl = document.querySelector("#filmstrip");
const basicControlsEl = document.querySelector("#basic-controls");
const colorControlsEl = document.querySelector("#color-controls");
const maskListEl = document.querySelector("#mask-list");
const snapshotListEl = document.querySelector("#snapshot-list");
const previewCanvasEl = document.querySelector("#preview-canvas");
const previewEmptyEl = document.querySelector("#preview-empty");
const previewMetaEl = document.querySelector("#preview-meta");
const dropTargetEl = document.querySelector("#drop-target");
const previewCardEl = document.querySelector("#preview-card");
const previewStageEl = document.querySelector("#preview-stage");
const cropOverlayEl = document.querySelector("#crop-overlay");
const cropBoxEl = document.querySelector("#crop-box");
const zoomLevelEl = document.querySelector("#zoom-level");
const handToolButtonEl = document.querySelector("#hand-tool");
const cropToolButtonEl = document.querySelector("#crop-tool");
const previewHelpEl = document.querySelector("#preview-help");
const previewCtx = previewCanvasEl.getContext("2d", { willReadFrequently: true });

function selectedBase() {
  return store.selectedImages[0];
}

function getImageCrop(image) {
  if (!image?.crop) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return image.crop;
}

function setImageCrop(image, crop) {
  if (!image) return;
  image.crop = {
    x: Math.max(0, Math.min(1, crop.x)),
    y: Math.max(0, Math.min(1, crop.y)),
    width: Math.max(0.05, Math.min(1, crop.width)),
    height: Math.max(0.05, Math.min(1, crop.height))
  };
}

function createSyntheticRawPreview(fileName) {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toUpperCase();
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const context = canvas.getContext("2d");

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#121720");
  gradient.addColorStop(1, "#2c3b52");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  for (let i = 0; i < 8; i += 1) {
    context.beginPath();
    context.moveTo(0, (canvas.height / 8) * i);
    context.lineTo(canvas.width, (canvas.height / 8) * i);
    context.stroke();
  }

  context.fillStyle = "rgba(255, 255, 255, 0.88)";
  context.font = "700 64px Segoe UI";
  context.fillText("RAW", 42, 120);

  context.font = "600 38px Segoe UI";
  context.fillStyle = "rgba(110, 168, 255, 0.95)";
  context.fillText(extension, 42, 180);

  context.font = "500 24px Segoe UI";
  context.fillStyle = "rgba(220, 230, 245, 0.95)";
  context.fillText(fileName.slice(0, 40), 42, 228);
  context.fillText("Embedded browser preview unavailable", 42, 265);

  return canvas.toDataURL("image/png");
}

function readImage(url) {
  if (sourceImageCache.has(url)) {
    return sourceImageCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

  sourceImageCache.set(url, promise);
  return promise;
}

function formatControlValue(control, value) {
  if (control.key === "whiteBalanceTemp") return `${Math.round(value)} K`;
  if (control.key === "exposure") return `${Number(value).toFixed(2)} EV`;
  return String(value);
}

function clampControlValue(control, value) {
  const min = Number(control.min);
  const max = Number(control.max);
  const step = Number(control.step);
  let nextValue = Number(value);
  if (!Number.isFinite(nextValue)) nextValue = Number(DEFAULT_ADJUSTMENTS[control.key]);
  nextValue = Math.min(max, Math.max(min, nextValue));
  const stepped = Math.round(nextValue / step) * step;
  const decimals = step < 1 ? Math.ceil(Math.log10(1 / step)) : 0;
  return Number(stepped.toFixed(decimals));
}

function computePreviewDimensions(sourceImage, scale = 1, crop = { x: 0, y: 0, width: 1, height: 1 }) {
  const cardWidth = previewCardEl.clientWidth - 24;
  const cardHeight = previewCardEl.clientHeight - 24;
  const cropWidth = Math.max(1, Math.round(sourceImage.naturalWidth * crop.width));
  const cropHeight = Math.max(1, Math.round(sourceImage.naturalHeight * crop.height));
  const fitScale = Math.min(cardWidth / cropWidth, cardHeight / cropHeight, 1);
  const displayScale = fitScale * scale;
  const qualityScale = Math.max(displayScale, 0.2);
  const targetScale = Math.min(qualityScale * (window.devicePixelRatio || 1), 1);
  const targetWidth = Math.max(64, Math.round(cropWidth * targetScale));
  const targetHeight = Math.max(64, Math.round(cropHeight * targetScale));
  return {
    targetWidth: Math.min(targetWidth, 2200),
    targetHeight: Math.min(targetHeight, 2200),
    fitScale,
    displayScale,
    displayWidth: Math.max(64, Math.round(cropWidth * displayScale)),
    displayHeight: Math.max(64, Math.round(cropHeight * displayScale)),
    sourceCropX: Math.round(sourceImage.naturalWidth * crop.x),
    sourceCropY: Math.round(sourceImage.naturalHeight * crop.y),
    sourceCropWidth: cropWidth,
    sourceCropHeight: cropHeight
  };
}

async function isPreviewUrlRenderable(url) {
  try {
    await readImage(url);
    return true;
  } catch {
    sourceImageCache.delete(url);
    return false;
  }
}

async function getRawPreviewUrlFromFile(file) {
  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const candidates = extractEmbeddedJpegPreviews(fileBytes, { minBytes: 2_048 });
    for (const candidate of candidates) {
      const candidateUrl = URL.createObjectURL(new Blob([candidate], { type: "image/jpeg" }));
      const renderable = await isPreviewUrlRenderable(candidateUrl);
      if (renderable) return candidateUrl;
      URL.revokeObjectURL(candidateUrl);
    }
  } catch {
    return null;
  }
  return null;
}

function setImageRating(imageId, rating) {
  store.selectImages([imageId]);
  store.rateSelected(rating);
  renderFilmstrip();
}

function setImageColorLabel(imageId, colorLabel) {
  store.selectImages([imageId]);
  if (colorLabel !== "none") store.setColorLabel(colorLabel);
  else store.selectedImages.forEach((img) => { img.colorLabel = null; });
  renderFilmstrip();
}

function renderFilmstrip() {
  filmstripEl.innerHTML = "";

  if (!store.images.length) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = "No files imported yet.";
    filmstripEl.append(empty);
    return;
  }

  store.images.forEach((image) => {
    const btn = document.createElement("button");
    btn.className = `filmstrip-item ${store.selectedIds.includes(image.id) ? "selected" : ""}`;
    btn.type = "button";

    const thumb = image.previewUrl
      ? `<img class="filmstrip-thumb" src="${image.previewUrl}" alt="${image.fileName}" />`
      : `<div class="filmstrip-thumb filmstrip-thumb--placeholder">RAW</div>`;

    btn.innerHTML = `${thumb}<strong>${image.fileName}</strong><small>${image.markedForDeletion ? "Marked for deletion" : ""}</small>`;

    const meta = document.createElement("div");
    meta.className = "filmstrip-meta";

    const stars = document.createElement("div");
    stars.className = "filmstrip-stars";
    for (let idx = 1; idx <= 5; idx += 1) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = `star-chip ${idx <= image.rating ? "active" : ""}`;
      star.textContent = "★";
      star.title = `${idx} star`;
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        setImageRating(image.id, idx);
      });
      stars.append(star);
    }

    const dots = document.createElement("div");
    dots.className = "color-dot-select";
    COLOR_OPTIONS.forEach((color) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `color-dot ${image.colorLabel === color || (!image.colorLabel && color === "none") ? "active" : ""}`;
      dot.style.background = COLOR_SWATCH[color];
      dot.title = color;
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        setImageColorLabel(image.id, color);
      });
      dots.append(dot);
    });

    meta.append(stars, dots);
    btn.append(meta);

    btn.onclick = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const next = store.selectedIds.includes(image.id)
          ? store.selectedIds.filter((id) => id !== image.id)
          : [...store.selectedIds, image.id];
        store.selectImages(next);
      } else {
        store.selectImages([image.id]);
      }
      render();
    };

    filmstripEl.append(btn);
  });
}

function setCropMode(enabled) {
  interactionState.cropMode = enabled;
  cropOverlayEl.hidden = !enabled;
  if (enabled) interactionState.handTool = false;
  updateToolUi();
}

function setHandTool(enabled) {
  interactionState.handTool = enabled;
  if (enabled) setCropMode(false);
  updateToolUi();
}

function isPreviewPannable() {
  return previewCardEl.scrollWidth > previewCardEl.clientWidth || previewCardEl.scrollHeight > previewCardEl.clientHeight;
}

function updateToolUi() {
  handToolButtonEl.classList.toggle("active", interactionState.handTool);
  cropToolButtonEl.classList.toggle("active", interactionState.cropMode);
  previewCardEl.classList.toggle("mode-crop", interactionState.cropMode);

  const panMode = (interactionState.spacePressed || interactionState.handTool) && isPreviewPannable();
  previewCardEl.classList.toggle("mode-pan", panMode);
  previewCardEl.classList.toggle("is-panning", interactionState.panning);

  if (interactionState.cropMode) previewHelpEl.textContent = "Crop mode: drag on image to set crop. Press C to exit.";
  else if (interactionState.handTool) previewHelpEl.textContent = "Hand tool active: drag to pan. Press H to switch back.";
  else previewHelpEl.textContent = "Pan: hold Space and drag (or press H for Hand tool).";
}

function applyZoom(scale, anchor = null) {
  const previousScale = zoomState.scale;
  const nextScale = Math.min(6, Math.max(0.1, scale));
  if (anchor && previousScale > 0) {
    const rect = previewCardEl.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, anchor.clientX - rect.left));
    const offsetY = Math.max(0, Math.min(rect.height, anchor.clientY - rect.top));
    const contentX = previewCardEl.scrollLeft + offsetX;
    const contentY = previewCardEl.scrollTop + offsetY;
    const ratio = nextScale / previousScale;
    zoomState.pendingPan = {
      left: contentX * ratio - offsetX,
      top: contentY * ratio - offsetY
    };
  }
  zoomState.scale = nextScale;
  schedulePreviewRender();
}

async function renderPreview() {
  const currentToken = ++previewRenderToken;
  const image = selectedBase();

  if (!image) {
    previewStageEl.hidden = true;
    previewCardEl.classList.remove("is-zoomed");
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Drag RAW/JPEG files here to begin.";
    previewMetaEl.textContent = "";
    updateToolUi();
    return;
  }

  previewMetaEl.textContent = `${image.fileName} • ${image.fullPath ?? "dropped file"}`;

  if (!image.previewUrl) {
    previewStageEl.hidden = true;
    previewCardEl.classList.remove("is-zoomed");
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Preview unavailable for this file.";
    updateToolUi();
    return;
  }

  try {
    const sourceImage = await readImage(image.previewUrl);
    if (currentToken !== previewRenderToken) return;

    const crop = getImageCrop(image);
    const dims = computePreviewDimensions(sourceImage, zoomState.scale, crop);
    const cacheKey = `${image.id}:${dims.targetWidth}x${dims.targetHeight}:${crop.x},${crop.y},${crop.width},${crop.height}`;

    let sourcePixels = sourcePixelsCache.get(cacheKey);
    if (!sourcePixels) {
      previewCanvasEl.width = dims.targetWidth;
      previewCanvasEl.height = dims.targetHeight;
      previewCtx.drawImage(
        sourceImage,
        dims.sourceCropX,
        dims.sourceCropY,
        dims.sourceCropWidth,
        dims.sourceCropHeight,
        0,
        0,
        dims.targetWidth,
        dims.targetHeight
      );
      sourcePixels = previewCtx.getImageData(0, 0, dims.targetWidth, dims.targetHeight);
      sourcePixelsCache.set(cacheKey, sourcePixels);
    } else {
      previewCanvasEl.width = sourcePixels.width;
      previewCanvasEl.height = sourcePixels.height;
    }

    const processed = processPreviewPixels(sourcePixels.data, sourcePixels.width, sourcePixels.height, image.adjustments);
    previewCtx.putImageData(new ImageData(processed, sourcePixels.width, sourcePixels.height), 0, 0);
    previewCanvasEl.style.width = `${dims.displayWidth}px`;
    previewCanvasEl.style.height = `${dims.displayHeight}px`;
    previewStageEl.style.width = `${dims.displayWidth}px`;
    previewStageEl.style.height = `${dims.displayHeight}px`;
    zoomLevelEl.textContent = `${Math.round(dims.displayScale * 100)}%`;

    const isZoomed = dims.displayWidth > previewCardEl.clientWidth || dims.displayHeight > previewCardEl.clientHeight;
    previewCardEl.classList.toggle("is-zoomed", isZoomed);

    if (zoomState.pendingPan) {
      const maxLeft = Math.max(0, previewCardEl.scrollWidth - previewCardEl.clientWidth);
      const maxTop = Math.max(0, previewCardEl.scrollHeight - previewCardEl.clientHeight);
      previewCardEl.scrollLeft = Math.max(0, Math.min(maxLeft, zoomState.pendingPan.left));
      previewCardEl.scrollTop = Math.max(0, Math.min(maxTop, zoomState.pendingPan.top));
      zoomState.pendingPan = null;
    }

    previewStageEl.hidden = false;
    previewEmptyEl.hidden = true;
    cropOverlayEl.hidden = !interactionState.cropMode;
    updateToolUi();
  } catch {
    previewStageEl.hidden = true;
    previewCardEl.classList.remove("is-zoomed");
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Unable to decode preview image.";
    updateToolUi();
  }
}

function schedulePreviewRender() {
  if (scheduledPreviewFrame) cancelAnimationFrame(scheduledPreviewFrame);
  scheduledPreviewFrame = requestAnimationFrame(() => {
    scheduledPreviewFrame = null;
    renderPreview();
  });
}

async function exportSelectedImage() {
  const selected = store.selectedImages;
  if (!selected.length) return;

  for (const image of selected) {
    if (!image.previewUrl) continue;
    const source = await readImage(image.previewUrl);
    const crop = getImageCrop(image);
    const cropX = Math.round(source.naturalWidth * crop.x);
    const cropY = Math.round(source.naturalHeight * crop.y);
    const cropWidth = Math.max(1, Math.round(source.naturalWidth * crop.width));
    const cropHeight = Math.max(1, Math.round(source.naturalHeight * crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processed = processPreviewPixels(pixels.data, canvas.width, canvas.height, image.adjustments);
    ctx.putImageData(new ImageData(processed, canvas.width, canvas.height), 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = image.fileName.replace(/\.[^/.]+$/, "") + "-edited.jpg";
    a.click();
  }
}

function createNestedControlRow({ label, value, min, max, step, onUpdate }) {
  const wrapper = document.createElement("label");
  wrapper.className = "control-row";

  const heading = document.createElement("div");
  heading.className = "control-heading";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueText = document.createElement("small");
  valueText.textContent = String(value);
  heading.append(labelEl, valueText);

  const sliderAndInput = document.createElement("div");
  sliderAndInput.className = "control-inputs";
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.className = "control-value-input";
  valueInput.min = String(min);
  valueInput.max = String(max);
  valueInput.step = String(step);
  valueInput.value = String(value);

  const applyValue = (next) => {
    const rounded = Number(next);
    if (!Number.isFinite(rounded)) return;
    const clamped = Math.min(max, Math.max(min, rounded));
    input.value = String(clamped);
    valueInput.value = String(clamped);
    valueText.textContent = String(clamped);
    onUpdate(clamped);
  };

  input.addEventListener("input", () => applyValue(input.value));
  valueInput.addEventListener("change", () => applyValue(valueInput.value));

  sliderAndInput.append(input, valueInput);
  wrapper.append(heading, sliderAndInput);
  return wrapper;
}

function renderBasicControls() {
  const image = selectedBase();
  basicControlsEl.innerHTML = "";
  if (!image) return;

  const sections = new Map();
  CONTROL_DEFINITIONS.forEach((control) => {
    if (!sections.has(control.section)) sections.set(control.section, []);
    sections.get(control.section).push(control);
  });

  sections.forEach((controls, sectionName) => {
    const section = document.createElement("section");
    section.className = "control-section";
    section.innerHTML = `<h3>${sectionName}</h3>`;

    controls.forEach((control) => {
      const wrapper = document.createElement("label");
      wrapper.className = "control-row";

      const heading = document.createElement("div");
      heading.className = "control-heading";
      const label = document.createElement("span");
      label.textContent = control.label;
      const valueText = document.createElement("small");
      valueText.textContent = formatControlValue(control, image.adjustments[control.key]);
      heading.append(label, valueText);

      const sliderAndInput = document.createElement("div");
      sliderAndInput.className = "control-inputs";
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = String(image.adjustments[control.key]);

      const valueInput = document.createElement("input");
      valueInput.type = "number";
      valueInput.className = "control-value-input";
      valueInput.dataset.controlKey = control.key;
      valueInput.min = String(control.min);
      valueInput.max = String(control.max);
      valueInput.step = String(control.step);
      valueInput.value = String(image.adjustments[control.key]);

      const applyControlUpdate = (value) => {
        const nextValue = clampControlValue(control, value);
        store.applyAdjustment(control.key, nextValue);
        input.value = String(nextValue);
        valueInput.value = String(nextValue);
        valueText.textContent = formatControlValue(control, nextValue);
        schedulePreviewRender();
      };

      input.addEventListener("input", () => applyControlUpdate(input.value));
      valueInput.addEventListener("change", () => applyControlUpdate(valueInput.value));
      valueInput.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        let increment = control.key === "exposure" ? 0.05 : 1;
        if (event.shiftKey) increment = control.key === "exposure" ? 0.5 : 10;
        applyControlUpdate(Number(valueInput.value) + (direction * increment));
      });
      input.addEventListener("dblclick", () => applyControlUpdate(DEFAULT_ADJUSTMENTS[control.key]));

      sliderAndInput.append(input, valueInput);
      wrapper.append(heading, sliderAndInput);
      section.append(wrapper);
    });

    basicControlsEl.append(section);
  });
}

function renderColorControls() {
  const image = selectedBase();
  colorControlsEl.innerHTML = "";
  if (!image) return;

  const mixerSection = document.createElement("section");
  mixerSection.className = "control-section";
  mixerSection.innerHTML = "<h3>HSL Mixer</h3>";

  MIXER_CHANNELS.forEach((channel) => {
    const group = document.createElement("div");
    group.className = "color-channel-group";
    group.innerHTML = `<h4>${channel}</h4>`;

    ["hue", "saturation", "luminance"].forEach((prop) => {
      const row = createNestedControlRow({
        label: prop,
        value: image.adjustments.colorMixer[channel][prop],
        min: -100,
        max: 100,
        step: 1,
        onUpdate: (next) => {
          image.adjustments.colorMixer[channel][prop] = next;
          schedulePreviewRender();
        }
      });
      group.append(row);
    });

    mixerSection.append(group);
  });

  const gradingSection = document.createElement("section");
  gradingSection.className = "control-section";
  gradingSection.innerHTML = "<h3>Color Grading</h3>";

  GRADE_RANGES.forEach((rangeName) => {
    const group = document.createElement("div");
    group.className = "color-channel-group";
    group.innerHTML = `<h4>${rangeName}</h4>`;

    const hue = createNestedControlRow({
      label: "hue",
      value: image.adjustments.colorGrade[rangeName].hue,
      min: 0,
      max: 360,
      step: 1,
      onUpdate: (next) => {
        image.adjustments.colorGrade[rangeName].hue = next;
        schedulePreviewRender();
      }
    });
    const sat = createNestedControlRow({
      label: "saturation",
      value: image.adjustments.colorGrade[rangeName].saturation,
      min: 0,
      max: 100,
      step: 1,
      onUpdate: (next) => {
        image.adjustments.colorGrade[rangeName].saturation = next;
        schedulePreviewRender();
      }
    });
    const lum = createNestedControlRow({
      label: "luminance",
      value: image.adjustments.colorGrade[rangeName].luminance,
      min: -100,
      max: 100,
      step: 1,
      onUpdate: (next) => {
        image.adjustments.colorGrade[rangeName].luminance = next;
        schedulePreviewRender();
      }
    });
    group.append(hue, sat, lum);
    gradingSection.append(group);
  });

  gradingSection.append(
    createNestedControlRow({
      label: "blending",
      value: image.adjustments.colorGrade.blending,
      min: 0,
      max: 100,
      step: 1,
      onUpdate: (next) => {
        image.adjustments.colorGrade.blending = next;
        schedulePreviewRender();
      }
    }),
    createNestedControlRow({
      label: "balance",
      value: image.adjustments.colorGrade.balance,
      min: -100,
      max: 100,
      step: 1,
      onUpdate: (next) => {
        image.adjustments.colorGrade.balance = next;
        schedulePreviewRender();
      }
    })
  );

  colorControlsEl.append(mixerSection, gradingSection);
}

function renderMasks() {
  const image = selectedBase();
  maskListEl.innerHTML = "";
  if (!image) return;
  image.masks.forEach((mask) => {
    const li = document.createElement("li");
    li.textContent = `${mask.type} (${mask.id})`;
    maskListEl.append(li);
  });
}

function renderSnapshots() {
  const image = selectedBase();
  snapshotListEl.innerHTML = "";
  if (!image) return;
  image.snapshots.forEach((snapshot) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.textContent = `${snapshot.name} (${new Date(snapshot.createdAt).toLocaleTimeString()})`;
    button.onclick = () => {
      store.restoreSnapshot(image.id, snapshot.id);
      render();
    };
    li.append(button);
    snapshotListEl.append(li);
  });
}

function downloadRecipe() {
  const payload = {
    exportedAt: new Date().toISOString(),
    images: store.selectedImages.map((image) => ({
      fileName: image.fileName,
      fullPath: image.fullPath,
      adjustments: image.adjustments,
      masks: image.masks,
      crop: image.crop,
      rating: image.rating,
      colorLabel: image.colorLabel
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ecdysis-edit-recipe.json";
  a.click();
  URL.revokeObjectURL(url);
}

function bindDragAndDrop() {
  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropTargetEl.addEventListener(eventName, preventDefaults);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropTargetEl.addEventListener(eventName, () => previewCardEl.classList.add("drag-over"));
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropTargetEl.addEventListener(eventName, () => previewCardEl.classList.remove("drag-over"));
  });

  dropTargetEl.addEventListener("drop", async (event) => {
    const imported = [];
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);

    for (const file of droppedFiles) {
      if (!supportsInlinePreview(file.name) && !isRawFile(file.name)) continue;
      const rawFormat = isRawFile(file.name);
      let previewUrl = null;
      if (supportsInlinePreview(file.name)) previewUrl = URL.createObjectURL(file);
      else if (rawFormat) {
        previewUrl = await getRawPreviewUrlFromFile(file);
        if (!previewUrl) previewUrl = createSyntheticRawPreview(file.name);
      }

      imported.push({ fileName: file.name, fullPath: file.path, previewUrl, rawFormat });
    }

    if (!imported.length) return;
    store.importFiles(imported);
    sourcePixelsCache.clear();
    render();
  });
}

function bindTabs() {
  const tabButtons = Array.from(document.querySelectorAll(".acr-tab"));
  const tabPanels = Array.from(document.querySelectorAll(".acr-panel"));

  function activateTab(tabName) {
    tabButtons.forEach((button) => {
      const active = button.dataset.tab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tabName;
    });
  }

  tabButtons.forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  activateTab("edit");
}

function isTypingIntoField(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function updateCropBoxFromPointer(event) {
  const rect = previewCanvasEl.getBoundingClientRect();
  const currentX = Math.max(rect.left, Math.min(rect.right, event.clientX));
  const currentY = Math.max(rect.top, Math.min(rect.bottom, event.clientY));
  const left = Math.min(interactionState.cropStartX, currentX) - rect.left;
  const top = Math.min(interactionState.cropStartY, currentY) - rect.top;
  const width = Math.abs(currentX - interactionState.cropStartX);
  const height = Math.abs(currentY - interactionState.cropStartY);
  cropBoxEl.style.left = `${left}px`;
  cropBoxEl.style.top = `${top}px`;
  cropBoxEl.style.width = `${width}px`;
  cropBoxEl.style.height = `${height}px`;
}

function commitCropFromBox() {
  const image = selectedBase();
  if (!image) return;
  const canvasRect = previewCanvasEl.getBoundingClientRect();
  const boxRect = cropBoxEl.getBoundingClientRect();
  if (boxRect.width < 16 || boxRect.height < 16) return;
  const x = (boxRect.left - canvasRect.left) / canvasRect.width;
  const y = (boxRect.top - canvasRect.top) / canvasRect.height;
  const width = boxRect.width / canvasRect.width;
  const height = boxRect.height / canvasRect.height;
  setImageCrop(image, { x, y, width, height });
  sourcePixelsCache.clear();
  setCropMode(false);
  schedulePreviewRender();
}

function normalizeGroup(group) {
  const compact = group.trim().toLowerCase().replace(/[^a-z]/g, "");
  return SELECTIVE_GROUP_ALIASES[compact] ?? group.trim();
}

function getSelectedCopyGroups() {
  const checked = Array.from(document.querySelectorAll("#selective-copy-groups input:checked"));
  const groups = checked.map((el) => normalizeGroup(el.value));
  return groups.length ? groups : ["light"];
}

function bindActions() {
  document.querySelector("#copy-all").onclick = () => store.copyAdjustments();
  document.querySelector("#copy-selective").onclick = () => {
    store.copyAdjustments({ includeGroups: getSelectedCopyGroups() });
  };
  document.querySelector("#paste").onclick = () => {
    store.pasteAdjustments();
    render();
  };
  document.querySelector("#snapshot").onclick = () => {
    const name = prompt("Snapshot name", "Snapshot");
    if (!name) return;
    store.createSnapshot(name);
    renderSnapshots();
  };
  document.querySelector("#preset").onclick = () => {
    const name = prompt("Preset name", "My Preset");
    if (!name) return;
    const includeGroups = prompt("Preset groups (comma separated)", "whiteBalance,light,color,effects")
      ?.split(",")
      .map((group) => group.trim());
    store.savePreset(name, includeGroups);
  };

  document.querySelector("#export-recipe").onclick = downloadRecipe;
  document.querySelector("#export-image").onclick = exportSelectedImage;

  document.querySelector("#apply-meta").onclick = () => {
    store.rateSelected(Number(document.querySelector("#rating").value));
    const label = document.querySelector("#color-label").value.trim();
    if (label) store.setColorLabel(label);
    renderFilmstrip();
  };

  document.querySelector("#mark-delete").onclick = () => {
    store.markSelectedForDeletion(true);
    renderFilmstrip();
  };

  document.querySelector("#add-mask").onclick = () => {
    const type = document.querySelector("#mask-type").value;
    store.addMask({ type, params: { feather: 50, strength: 75 }, adjustments: { exposure: 0.3 } });
    renderMasks();
  };

  document.querySelector("#zoom-in").onclick = () => {
    const rect = previewCardEl.getBoundingClientRect();
    applyZoom(zoomState.scale * 1.2, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  };
  document.querySelector("#zoom-out").onclick = () => {
    const rect = previewCardEl.getBoundingClientRect();
    applyZoom(zoomState.scale / 1.2, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  };
  document.querySelector("#zoom-fit").onclick = () => {
    zoomState.pendingPan = { left: 0, top: 0 };
    zoomState.scale = 1;
    schedulePreviewRender();
  };

  handToolButtonEl.onclick = () => setHandTool(!interactionState.handTool);
  cropToolButtonEl.onclick = () => setCropMode(!interactionState.cropMode);

  previewCardEl.addEventListener("wheel", (event) => {
    if (event.deltaY === 0) return;
    const isZoomGesture = event.ctrlKey || event.metaKey;
    if (!isZoomGesture) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    applyZoom(zoomState.scale * factor, { clientX: event.clientX, clientY: event.clientY });
  }, { passive: false });

  const startPan = (event) => {
    event.preventDefault();
    interactionState.panning = true;
    interactionState.panStartX = event.clientX;
    interactionState.panStartY = event.clientY;
    interactionState.scrollLeft = previewCardEl.scrollLeft;
    interactionState.scrollTop = previewCardEl.scrollTop;
    updateToolUi();
  };

  previewCardEl.addEventListener("mousedown", (event) => {
    if (interactionState.cropMode) {
      if (event.button !== 0 || !previewCanvasEl.isConnected) return;
      interactionState.cropDragging = true;
      interactionState.cropStartX = event.clientX;
      interactionState.cropStartY = event.clientY;
      cropBoxEl.style.left = "0px";
      cropBoxEl.style.top = "0px";
      cropBoxEl.style.width = "0px";
      cropBoxEl.style.height = "0px";
      updateCropBoxFromPointer(event);
      return;
    }

    const panIntent = interactionState.spacePressed || interactionState.handTool || event.button === 1;
    if (!panIntent || !isPreviewPannable() || (event.button !== 0 && event.button !== 1)) return;
    startPan(event);
  });

  previewCardEl.addEventListener("dblclick", (event) => {
    if (!selectedBase()) return;
    const targetScale = zoomState.scale <= 1.05 ? 2 : 1;
    applyZoom(targetScale, { clientX: event.clientX, clientY: event.clientY });
  });

  previewCanvasEl.addEventListener("dragstart", (event) => event.preventDefault());

  window.addEventListener("mousemove", (event) => {
    if (interactionState.cropDragging) {
      updateCropBoxFromPointer(event);
      return;
    }
    if (!interactionState.panning) return;
    event.preventDefault();
    previewCardEl.scrollLeft = interactionState.scrollLeft - (event.clientX - interactionState.panStartX);
    previewCardEl.scrollTop = interactionState.scrollTop - (event.clientY - interactionState.panStartY);
  });

  window.addEventListener("mouseup", () => {
    if (interactionState.cropDragging) {
      interactionState.cropDragging = false;
      commitCropFromBox();
      return;
    }
    interactionState.panning = false;
    updateToolUi();
  });

  window.addEventListener("blur", () => {
    interactionState.spacePressed = false;
    interactionState.panning = false;
    updateToolUi();
  });

  window.addEventListener("resize", () => {
    sourcePixelsCache.clear();
    schedulePreviewRender();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !isTypingIntoField(event.target)) {
      interactionState.spacePressed = true;
      updateToolUi();
      event.preventDefault();
    }

    if (event.key.toLowerCase() === "c" && !event.ctrlKey && !isTypingIntoField(event.target)) {
      setCropMode(!interactionState.cropMode);
      event.preventDefault();
    }

    if (event.key.toLowerCase() === "h" && !event.ctrlKey && !isTypingIntoField(event.target)) {
      setHandTool(!interactionState.handTool);
      event.preventDefault();
    }

    if (!isTypingIntoField(event.target) && selectedBase()) {
      if (/^[1-5]$/.test(event.key)) {
        store.rateSelected(Number(event.key));
        renderFilmstrip();
        event.preventDefault();
      }

      if (COLOR_SHORTCUTS[event.key]) {
        store.setColorLabel(COLOR_SHORTCUTS[event.key]);
        renderFilmstrip();
        event.preventDefault();
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        store.markSelectedForDeletion(true);
        renderFilmstrip();
        event.preventDefault();
      }
    }

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (event.shiftKey) store.copyAdjustments({ includeGroups: getSelectedCopyGroups() });
      else store.copyAdjustments();
    }

    if (event.ctrlKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      store.pasteAdjustments();
      render();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    interactionState.spacePressed = false;
    interactionState.panning = false;
    updateToolUi();
  });
}

function render() {
  renderFilmstrip();
  renderBasicControls();
  renderColorControls();
  renderMasks();
  renderSnapshots();
  renderPreview();
}

bindDragAndDrop();
bindTabs();
bindActions();
render();
