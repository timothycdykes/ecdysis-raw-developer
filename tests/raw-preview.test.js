import test from "node:test";
import assert from "node:assert/strict";

import { extractEmbeddedJpegPreview, findEmbeddedJpegRange } from "../src/core/raw-preview.js";

function makeJpeg(size) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[size - 2] = 0xff;
  bytes[size - 1] = 0xd9;
  for (let i = 2; i < size - 2; i += 1) {
    bytes[i] = i % 255;
  }
  return bytes;
}

test("findEmbeddedJpegRange returns the largest embedded jpeg", () => {
  const small = makeJpeg(5000);
  const large = makeJpeg(22000);
  const bytes = new Uint8Array(30000);

  bytes.set(small, 500);
  bytes.set(large, 7000);

  const range = findEmbeddedJpegRange(bytes, { minBytes: 4096 });

  assert.equal(range.start, 7000);
  assert.equal(range.end, 7000 + 22000);
  assert.equal(range.size, 22000);
});

test("extractEmbeddedJpegPreview returns null when no embedded jpeg is available", () => {
  const bytes = new Uint8Array(4096);
  const preview = extractEmbeddedJpegPreview(bytes);
  assert.equal(preview, null);
});

test("extractEmbeddedJpegPreview rejects thumbnails below minBytes", () => {
  const thumbnail = makeJpeg(3000);
  const bytes = new Uint8Array(4096);
  bytes.set(thumbnail, 100);

  const preview = extractEmbeddedJpegPreview(bytes, { minBytes: 4096 });
  assert.equal(preview, null);
});
