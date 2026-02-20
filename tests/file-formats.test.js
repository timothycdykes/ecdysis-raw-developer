import test from "node:test";
import assert from "node:assert/strict";
import { isRawFile, supportsInlinePreview } from "../src/core/file-formats.js";

test("recognizes common manufacturer RAW extensions", () => {
  ["img.cr2", "img.NEF", "img.ArW", "img.dng", "img.iiq", "img.3fr", "img.pef", "img.x3f"].forEach((name) => {
    assert.equal(isRawFile(name), true, `expected ${name} to be detected as RAW`);
  });
});

test("accepts standard raster formats for direct inline preview", () => {
  ["a.jpg", "b.JPEG", "c.png", "d.tiff", "e.avif", "f.heic", "g.HEIF", "h.jfif"].forEach((name) => {
    assert.equal(supportsInlinePreview(name), true);
  });

  assert.equal(supportsInlinePreview("camera.NEF"), false);
});
