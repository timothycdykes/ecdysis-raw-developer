import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADJUSTMENTS } from "../src/core/adjustments.js";
import { processPreviewPixels } from "../src/core/preview-renderer.js";

function singlePixel([r, g, b, a], adjustments) {
  const out = processPreviewPixels(new Uint8ClampedArray([r, g, b, a]), 1, 1, adjustments);
  return [out[0], out[1], out[2], out[3]];
}

test("white balance temperature and tint affect channel balance", () => {
  const warm = singlePixel([120, 120, 120, 255], { ...DEFAULT_ADJUSTMENTS, whiteBalanceTemp: 8000, whiteBalanceTint: 100 });

  assert.ok(warm[0] > warm[2], "expected red channel to exceed blue when warming");
  assert.ok(warm[1] > 120, "expected tint to increase green channel");
});

test("exposure now works in EV stops", () => {
  const base = singlePixel([80, 80, 80, 255], { ...DEFAULT_ADJUSTMENTS, exposure: 0 });
  const plusOne = singlePixel([80, 80, 80, 255], { ...DEFAULT_ADJUSTMENTS, exposure: 1 });

  assert.ok(plusOne[0] > base[0], "expected +1 EV to brighten the preview");
});

test("light controls modify tonal response", () => {
  const lifted = singlePixel(
    [200, 200, 200, 255],
    { ...DEFAULT_ADJUSTMENTS, highlights: -80, shadows: 60, whites: 50, blacks: -40 }
  );

  assert.notDeepEqual(lifted.slice(0, 3), [200, 200, 200]);
});

test("vibrance and saturation alter chroma", () => {
  const vivid = singlePixel([140, 110, 100, 255], { ...DEFAULT_ADJUSTMENTS, vibrance: 80, saturation: 40 });
  assert.ok(vivid[0] - vivid[2] > 40, "expected stronger color separation after vibrance/saturation boost");
});
