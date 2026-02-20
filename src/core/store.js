import { COPY_GROUPS, DEFAULT_ADJUSTMENTS, deepClone, extractAdjustments, mergeAdjustments } from "./adjustments.js";

export const DEFAULT_COLOR_LABELS = ["red", "yellow", "green", "blue", "purple"];

export function createImageRecord({ id, fileName, thumbnail, fullPath }) {
  return {
    id,
    fileName,
    thumbnail,
    fullPath,
    adjustments: deepClone(DEFAULT_ADJUSTMENTS),
    snapshots: [],
    masks: [],
    rating: 0,
    colorLabel: null,
    markedForDeletion: false
  };
}

export class RawDeveloperStore {
  constructor(images = []) {
    this.images = images.map(createImageRecord);
    this.selectedIds = this.images.length ? [this.images[0].id] : [];
    this.clipboardAdjustments = null;
    this.presets = [];
    this.colorLabels = [...DEFAULT_COLOR_LABELS];
  }

  get selectedImages() {
    return this.images.filter((img) => this.selectedIds.includes(img.id));
  }

  selectImages(ids) {
    this.selectedIds = [...new Set(ids)].filter((id) => this.images.some((img) => img.id === id));
  }

  applyAdjustment(key, value) {
    this.selectedImages.forEach((image) => {
      image.adjustments[key] = deepClone(value);
    });
  }

  applyAdjustmentSet(partialAdjustments) {
    this.selectedImages.forEach((image) => {
      image.adjustments = mergeAdjustments(image.adjustments, partialAdjustments);
    });
  }

  createSnapshot(name) {
    const created = [];
    this.selectedImages.forEach((image) => {
      const snapshot = {
        id: `${image.id}-snap-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        name,
        createdAt: new Date().toISOString(),
        adjustments: deepClone(image.adjustments),
        masks: deepClone(image.masks)
      };
      image.snapshots.push(snapshot);
      created.push(snapshot);
    });
    return created;
  }

  restoreSnapshot(imageId, snapshotId) {
    const image = this.images.find((img) => img.id === imageId);
    if (!image) return false;

    const snapshot = image.snapshots.find((snap) => snap.id === snapshotId);
    if (!snapshot) return false;

    image.adjustments = deepClone(snapshot.adjustments);
    image.masks = deepClone(snapshot.masks);
    return true;
  }

  copyAdjustments({ includeGroups = Object.keys(COPY_GROUPS) } = {}) {
    const source = this.selectedImages[0];
    if (!source) return null;
    this.clipboardAdjustments = extractAdjustments(source.adjustments, includeGroups);
    return deepClone(this.clipboardAdjustments);
  }

  pasteAdjustments() {
    if (!this.clipboardAdjustments) return;
    this.applyAdjustmentSet(this.clipboardAdjustments);
  }

  savePreset(name, includeGroups = Object.keys(COPY_GROUPS)) {
    const source = this.selectedImages[0];
    if (!source) return null;

    const preset = {
      id: `preset-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      name,
      includeGroups,
      adjustments: extractAdjustments(source.adjustments, includeGroups)
    };

    this.presets.push(preset);
    return deepClone(preset);
  }

  applyPreset(presetId) {
    const preset = this.presets.find((entry) => entry.id === presetId);
    if (!preset) return false;
    this.applyAdjustmentSet(preset.adjustments);
    return true;
  }

  rateSelected(rating) {
    this.selectedImages.forEach((image) => {
      image.rating = Math.max(0, Math.min(5, rating));
    });
  }

  setColorLabel(label) {
    if (!this.colorLabels.includes(label)) {
      this.colorLabels.push(label);
    }

    this.selectedImages.forEach((image) => {
      image.colorLabel = label;
    });
  }

  markSelectedForDeletion(flag = true) {
    this.selectedImages.forEach((image) => {
      image.markedForDeletion = flag;
    });
  }

  addMask(mask) {
    const normalizedMask = {
      id: `mask-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      type: mask.type,
      params: deepClone(mask.params),
      adjustments: mergeAdjustments(DEFAULT_ADJUSTMENTS, mask.adjustments ?? {})
    };

    this.selectedImages.forEach((image) => {
      image.masks.push(deepClone(normalizedMask));
    });

    return normalizedMask;
  }
}
