import { RawDeveloperStore } from "../core/store.js";

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

const store = new RawDeveloperStore([
  { id: "1", fileName: "IMG_1001.CR3", thumbnail: "", fullPath: "C:/photos/IMG_1001.CR3" },
  { id: "2", fileName: "IMG_1002.CR3", thumbnail: "", fullPath: "C:/photos/IMG_1002.CR3" },
  { id: "3", fileName: "IMG_1003.NEF", thumbnail: "", fullPath: "C:/photos/IMG_1003.NEF" }
]);

const filmstripEl = document.querySelector("#filmstrip");
const basicControlsEl = document.querySelector("#basic-controls");
const maskListEl = document.querySelector("#mask-list");
const snapshotListEl = document.querySelector("#snapshot-list");

function selectedBase() {
  return store.selectedImages[0];
}

function renderFilmstrip() {
  filmstripEl.innerHTML = "";
  store.images.forEach((image) => {
    const btn = document.createElement("button");
    btn.className = `filmstrip-item ${store.selectedIds.includes(image.id) ? "selected" : ""}`;
    btn.type = "button";
    btn.innerHTML = `<strong>${image.fileName}</strong>
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

function renderBasicControls() {
  const image = selectedBase();
  if (!image) return;
  basicControlsEl.innerHTML = "";

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
}

bindActions();
render();
