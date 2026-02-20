import test from "node:test";
import assert from "node:assert/strict";
import { RawDeveloperStore } from "../src/core/store.js";

test("imported files are appended and auto-selected when list was empty", () => {
  const store = new RawDeveloperStore();
  const imported = store.importFiles([
    { fileName: "A7IV_0001.ARW", fullPath: "C:/sony/A7IV_0001.ARW", rawFormat: true },
    { fileName: "A7IV_0002.ARW", fullPath: "C:/sony/A7IV_0002.ARW", rawFormat: true }
  ]);

  assert.equal(store.images.length, 2);
  assert.equal(imported[0].fileName, "A7IV_0001.ARW");
  assert.equal(store.selectedImages[0].fileName, "A7IV_0001.ARW");
});

test("copy selective adjustments and paste only light group", () => {
  const store = new RawDeveloperStore([
    { id: "1", fileName: "a.CR3" },
    { id: "2", fileName: "b.CR3" }
  ]);

  store.selectImages(["1"]);
  store.applyAdjustment("exposure", 40);
  store.applyAdjustment("whiteBalanceTemp", 25);
  store.copyAdjustments({ includeGroups: ["light"] });

  store.selectImages(["2"]);
  store.applyAdjustment("exposure", 0);
  store.applyAdjustment("whiteBalanceTemp", 0);
  store.pasteAdjustments();

  const second = store.selectedImages[0];
  assert.equal(second.adjustments.exposure, 40);
  assert.equal(second.adjustments.whiteBalanceTemp, 0);
});

test("snapshot round-trip restores image state", () => {
  const store = new RawDeveloperStore([{ id: "1", fileName: "a.CR3" }]);
  store.applyAdjustment("contrast", 55);
  store.selectedImages[0].crop = { x: 0.1, y: 0.15, width: 0.8, height: 0.75 };
  const [snap] = store.createSnapshot("Strong Contrast");

  store.applyAdjustment("contrast", -20);
  store.selectedImages[0].crop = { x: 0, y: 0, width: 1, height: 1 };
  store.restoreSnapshot("1", snap.id);

  assert.equal(store.selectedImages[0].adjustments.contrast, 55);
  assert.deepEqual(store.selectedImages[0].crop, { x: 0.1, y: 0.15, width: 0.8, height: 0.75 });
});

test("preset saves selected groups and reapplies", () => {
  const store = new RawDeveloperStore([
    { id: "1", fileName: "a.CR3" },
    { id: "2", fileName: "b.CR3" }
  ]);

  store.applyAdjustment("saturation", 30);
  store.applyAdjustment("dehaze", 70);
  const preset = store.savePreset("Color Pop", ["color"]);

  store.selectImages(["2"]);
  store.applyAdjustment("saturation", 0);
  store.applyAdjustment("dehaze", 0);
  store.applyPreset(preset.id);

  assert.equal(store.selectedImages[0].adjustments.saturation, 30);
  assert.equal(store.selectedImages[0].adjustments.dehaze, 0);
});

test("copy selective can include color mixer and grading groups", () => {
  const store = new RawDeveloperStore([
    { id: "1", fileName: "a.CR3" },
    { id: "2", fileName: "b.CR3" }
  ]);

  store.selectImages(["1"]);
  store.selectedImages[0].adjustments.colorMixer.blue.saturation = 45;
  store.selectedImages[0].adjustments.colorGrade.global.saturation = 55;
  store.copyAdjustments({ includeGroups: ["mixer", "grade"] });

  store.selectImages(["2"]);
  store.pasteAdjustments();

  assert.equal(store.selectedImages[0].adjustments.colorMixer.blue.saturation, 45);
  assert.equal(store.selectedImages[0].adjustments.colorGrade.global.saturation, 55);
  assert.equal(store.selectedImages[0].adjustments.exposure, 0);
});

test("profile selective copy transfers profile settings", () => {
  const store = new RawDeveloperStore([
    { id: "1", fileName: "a.CR3" },
    { id: "2", fileName: "b.CR3" }
  ]);

  store.selectImages(["1"]);
  store.applyAdjustment("cameraProfile", "adobeLandscape");
  store.applyAdjustment("profileAmount", 150);
  store.applyAdjustment("treatment", "blackAndWhite");
  store.copyAdjustments({ includeGroups: ["profile"] });

  store.selectImages(["2"]);
  store.pasteAdjustments();

  assert.equal(store.selectedImages[0].adjustments.cameraProfile, "adobeLandscape");
  assert.equal(store.selectedImages[0].adjustments.profileAmount, 150);
  assert.equal(store.selectedImages[0].adjustments.treatment, "blackAndWhite");
  assert.equal(store.selectedImages[0].adjustments.exposure, 0);
});
