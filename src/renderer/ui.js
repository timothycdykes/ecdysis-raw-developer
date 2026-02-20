import { RawDeveloperStore } from "../core/store.js";
import { isRawFile, supportsInlinePreview } from "../core/file-formats.js";

const basicControlKeys = [
  "whiteBalanceTemp",
  "whiteBalanceTint",
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "saturation",
  "vibrance",
  "clarity",
  "texture",
  "dehaze",
  "vignette"
];

const store = new RawDeveloperStore([]);

const filmstripEl = document.querySelector("#filmstrip");
const basicControlsEl = document.querySelector("#basic-controls");
const maskListEl = document.querySelector("#mask-list");
const snapshotListEl = document.querySelector("#snapshot-list");
const previewImageEl = document.querySelector("#preview-image");
const previewEmptyEl = document.querySelector("#preview-empty");
const previewMetaEl = document.querySelector("#preview-meta");
const dropTargetEl = document.querySelector("#drop-target");
const previewCardEl = document.querySelector("#preview-card");

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

function adjustmentToFilter(adjustments) {
  const exposure = adjustments.exposure / 100;
  const contrast = adjustments.contrast;
  const saturation = adjustments.saturation + Math.floor(adjustments.vibrance * 0.5);
  const clarity = adjustments.clarity / 200;

  const brightness = Math.max(0.1, 1 + exposure);
  const contrastScale = Math.max(0.1, 1 + contrast / 100);
  const saturationScale = Math.max(0.1, 1 + saturation / 100);
  const sharpness = Math.max(0, clarity * 0.25);

  return `brightness(${brightness}) contrast(${contrastScale}) saturate(${saturationScale}) drop-shadow(0 0 ${sharpness}px rgba(255,255,255,0.65))`;
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

function renderPreview() {
  const image = selectedBase();
  if (!image) {
    previewImageEl.hidden = true;
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Drag RAW/JPEG files here to begin.";
    previewMetaEl.textContent = "";
    return;
  }

  previewMetaEl.textContent = `${image.fileName} • ${image.fullPath ?? "dropped file"}`;

  if (!image.previewUrl) {
    previewImageEl.hidden = true;
    previewEmptyEl.hidden = false;
    previewEmptyEl.textContent = "Preview unavailable for this file.";
    return;
  }

  previewImageEl.src = image.previewUrl;
  previewImageEl.style.filter = adjustmentToFilter(image.adjustments);
  previewImageEl.hidden = false;
  previewEmptyEl.hidden = true;
}

function renderBasicControls() {
  const image = selectedBase();
  basicControlsEl.innerHTML = "";
  if (!image) return;

  basicControlKeys.forEach((key) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = key;

    const input = document.createElement("input");
    input.type = "range";
    input.min = "-100";
    input.max = "100";
    input.step = "1";
    input.value = String(image.adjustments[key]);

    const valueText = document.createElement("small");
    valueText.textContent = String(image.adjustments[key]);

    input.addEventListener("input", () => {
      store.applyAdjustment(key, Number(input.value));
      valueText.textContent = input.value;
      renderFilmstrip();
      renderPreview();
    });

    wrapper.append(input, valueText);
    basicControlsEl.append(wrapper);
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

  dropTargetEl.addEventListener("drop", (event) => {
    const imported = [];

    Array.from(event.dataTransfer?.files ?? []).forEach((file) => {
      if (!supportsInlinePreview(file.name) && !isRawFile(file.name)) {
        return;
      }

      const rawFormat = isRawFile(file.name);
      const previewUrl = supportsInlinePreview(file.name)
        ? URL.createObjectURL(file)
        : rawFormat
          ? createSyntheticRawPreview(file.name)
          : null;

      imported.push({
        fileName: file.name,
        fullPath: file.path,
        previewUrl,
        rawFormat
      });
    });

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
