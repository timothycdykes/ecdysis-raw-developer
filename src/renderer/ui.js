import { DEFAULT_ADJUSTMENTS } from "../core/adjustments.js";
import { RawDeveloperStore } from "../core/store.js";
import { isRawFile, supportsInlinePreview } from "../core/file-formats.js";
import { extractEmbeddedJpegPreview } from "../core/raw-preview.js";
import { processPreviewPixels } from "../core/preview-renderer.js";

const CONTROL_DEFINITIONS = [
  { key: "whiteBalanceTemp", label: "Temperature", min: -100, max: 100, step: 1, section: "White Balance" },
  { key: "whiteBalanceTint", label: "Tint", min: -100, max: 100, step: 1, section: "White Balance" },
  { key: "exposure", label: "Exposure", min: -100, max: 100, step: 1, section: "Light" },
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
let previewRenderToken = 0;

const filmstripEl = document.querySelector("#filmstrip");
const basicControlsEl = document.querySelector("#basic-controls");
const maskListEl = document.querySelector("#mask-list");
const snapshotListEl = document.querySelector("#snapshot-list");
const previewCanvasEl = document.querySelector("#preview-canvas");
const previewEmptyEl = document.querySelector("#preview-empty");
const previewMetaEl = document.querySelector("#preview-meta");
const dropTargetEl = document.querySelector("#drop-target");
const previewCardEl = document.querySelector("#preview-card");
const previewCtx = previewCanvasEl.getContext("2d", { willReadFrequently: true });

function selectedBase() {
  return store.selectedImages[0];
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

    btn.innerHTML = `${thumb}<strong>${image.fileName}</strong>
      <small>${image.rating ? "★".repeat(image.rating) : "Unrated"} ${image.colorLabel ? `• ${image.colorLabel}` : ""}</small>
      ${image.markedForDeletion ? "<small>Marked for deletion</small>" : ""}`;
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

async function renderPreview() {
  const currentToken = ++previewRenderToken;
  const image = selectedBase();

  if (!image) {
    previewCanvasEl.hidden = true;
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Drag RAW/JPEG files here to begin.";
    previewMetaEl.textContent = "";
    return;
  }

  previewMetaEl.textContent = `${image.fileName} • ${image.fullPath ?? "dropped file"}`;

  if (!image.previewUrl) {
    previewCanvasEl.hidden = true;
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Preview unavailable for this file.";
    return;
  }

  try {
    const sourceImage = await readImage(image.previewUrl);
    if (currentToken !== previewRenderToken) {
      return;
    }

    previewCanvasEl.width = sourceImage.naturalWidth;
    previewCanvasEl.height = sourceImage.naturalHeight;
    previewCtx.drawImage(sourceImage, 0, 0);

    const pixels = previewCtx.getImageData(0, 0, previewCanvasEl.width, previewCanvasEl.height);
    const processed = processPreviewPixels(pixels.data, previewCanvasEl.width, previewCanvasEl.height, image.adjustments);
    const nextImage = new ImageData(processed, previewCanvasEl.width, previewCanvasEl.height);
    previewCtx.putImageData(nextImage, 0, 0);

    previewCanvasEl.hidden = false;
    previewEmptyEl.hidden = true;
  } catch {
    previewCanvasEl.hidden = true;
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Unable to decode preview image.";
  }
}

function renderBasicControls() {
  const image = selectedBase();
  basicControlsEl.innerHTML = "";
  if (!image) return;

  const sections = new Map();
  CONTROL_DEFINITIONS.forEach((control) => {
    if (!sections.has(control.section)) {
      sections.set(control.section, []);
    }
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
      valueText.textContent = String(image.adjustments[control.key]);

      heading.append(label, valueText);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = String(image.adjustments[control.key]);

      input.addEventListener("input", () => {
        store.applyAdjustment(control.key, Number(input.value));
        valueText.textContent = input.value;
        renderFilmstrip();
        renderPreview();
      });

      input.addEventListener("dblclick", () => {
        const resetValue = DEFAULT_ADJUSTMENTS[control.key];
        input.value = String(resetValue);
        store.applyAdjustment(control.key, resetValue);
        valueText.textContent = String(resetValue);
        renderFilmstrip();
        renderPreview();
      });

      wrapper.append(heading, input);
      section.append(wrapper);
    });

    basicControlsEl.append(section);
  });
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
    dropTargetEl.addEventListener(eventName, () => {
      previewCardEl.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropTargetEl.addEventListener(eventName, () => {
      previewCardEl.classList.remove("drag-over");
    });
  });

  dropTargetEl.addEventListener("drop", async (event) => {
    const imported = [];
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);

    for (const file of droppedFiles) {
      if (!supportsInlinePreview(file.name) && !isRawFile(file.name)) {
        continue;
      }

      const rawFormat = isRawFile(file.name);
      let previewUrl = null;

      if (supportsInlinePreview(file.name)) {
        previewUrl = URL.createObjectURL(file);
      } else if (rawFormat) {
        try {
          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const embeddedPreview = extractEmbeddedJpegPreview(fileBytes, { minBytes: 4_096 });
          if (embeddedPreview) {
            previewUrl = URL.createObjectURL(new Blob([embeddedPreview], { type: "image/jpeg" }));
          }
        } catch {
          previewUrl = null;
        }

        if (!previewUrl) {
          previewUrl = createSyntheticRawPreview(file.name);
        }
      }

      imported.push({
        fileName: file.name,
        fullPath: file.path,
        previewUrl,
        rawFormat
      });
    }

    if (!imported.length) return;
    store.importFiles(imported);
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

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  activateTab("edit");
}

function bindActions() {
  document.querySelector("#copy-all").onclick = () => store.copyAdjustments();
  document.querySelector("#copy-selective").onclick = () => {
    const includeGroups = prompt(
      "Enter groups: whiteBalance,light,color,effects,curves,mixer,grade",
      "whiteBalance,light,color,effects"
    );
    if (!includeGroups) return;
    store.copyAdjustments({ includeGroups: includeGroups.split(",").map((group) => group.trim()) });
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

  document.querySelector("#apply-meta").onclick = () => {
    store.rateSelected(Number(document.querySelector("#rating").value));
    const label = document.querySelector("#color-label").value.trim();
    if (label) {
      store.setColorLabel(label);
    }
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

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (event.shiftKey) {
        document.querySelector("#copy-selective").click();
      } else {
        store.copyAdjustments();
      }
    }

    if (event.ctrlKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      store.pasteAdjustments();
      render();
    }
  });
}

function render() {
  renderFilmstrip();
  renderBasicControls();
  renderMasks();
  renderSnapshots();
  renderPreview();
}

bindDragAndDrop();
bindTabs();
bindActions();
render();
