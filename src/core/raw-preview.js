const JPEG_SOI_FIRST = 0xff;
const JPEG_SOI_SECOND = 0xd8;
const JPEG_EOI_FIRST = 0xff;
const JPEG_EOI_SECOND = 0xd9;

function isStartOfJpeg(bytes, index) {
  return bytes[index] === JPEG_SOI_FIRST && bytes[index + 1] === JPEG_SOI_SECOND;
}

function isEndOfJpeg(bytes, index) {
  return bytes[index] === JPEG_EOI_FIRST && bytes[index + 1] === JPEG_EOI_SECOND;
}

export function findEmbeddedJpegRanges(buffer, { minBytes = 4_096 } = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ranges = [];

  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (!isStartOfJpeg(bytes, index)) {
      continue;
    }

    for (let tail = index + 2; tail < bytes.length - 1; tail += 1) {
      if (!isEndOfJpeg(bytes, tail)) {
        continue;
      }

      const end = tail + 2;
      const size = end - index;
      if (size >= minBytes) {
        ranges.push({ start: index, end, size });
      }

      index = tail;
      break;
    }
  }

  return ranges.sort((a, b) => b.size - a.size);
}

export function findEmbeddedJpegRange(buffer, options = {}) {
  return findEmbeddedJpegRanges(buffer, options)[0] ?? null;
}

export function extractEmbeddedJpegPreviews(buffer, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ranges = findEmbeddedJpegRanges(bytes, options);

  return ranges.map((range) => bytes.slice(range.start, range.end));
}

export function extractEmbeddedJpegPreview(buffer, options = {}) {
  return extractEmbeddedJpegPreviews(buffer, options)[0] ?? null;
}
