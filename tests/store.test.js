import test from "node:test";
import assert from "node:assert/strict";
import { RawDeveloperStore } from "../src/core/store.js";

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
  const [snap] = store.createSnapshot("Strong Contrast");

  store.applyAdjustment("contrast", -20);
  store.restoreSnapshot("1", snap.id);

  assert.equal(store.selectedImages[0].adjustments.contrast, 55);
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
