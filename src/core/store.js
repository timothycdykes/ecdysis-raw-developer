import { COPY_GROUPS, DEFAULT_ADJUSTMENTS, deepClone, extractAdjustments, mergeAdjustments } from "./adjustments.js";

export const DEFAULT_COLOR_LABELS = ["red", "yellow", "green", "blue", "purple"];

export function createImageRecord({ id, fileName, thumbnail, fullPath, previewUrl = null, rawFormat = false }) {
  return {
    id,
    fileName,
    thumbnail,
    fullPath,
    previewUrl,
    rawFormat,
    adjustments: deepClone(DEFAULT_ADJUSTMENTS),
    snapshots: [],
    masks: [],
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rating: 0,
    colorLabel: null,
    markedForDeletion: false
  };
}

export class RawDeveloperStore {
  constructor(images = []) {
    this.nextImageId = images.length;
    this.images = images.map((image) => this.withId(image));
    this.selectedIds = this.images.length ? [this.images[0].id] : [];
    this.clipboardAdjustments = null;
    this.presets = [];
    this.colorLabels = [...DEFAULT_COLOR_LABELS];
  }

  withId(image) {
    if (image.id) {
      return createImageRecord(image);
    }

    this.nextImageId += 1;
    return createImageRecord({ ...image, id: `img-${this.nextImageId}` });
  }

  importFiles(files = []) {
    const imported = files.map((file) => this.withId(file));
    this.images.push(...imported);

    if (!this.selectedIds.length && imported.length) {
      this.selectedIds = [imported[0].id];
    }

    return deepClone(imported);
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
        masks: deepClone(image.masks),
        crop: deepClone(image.crop)
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
    image.crop = deepClone(snapshot.crop ?? { x: 0, y: 0, width: 1, height: 1 });
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
