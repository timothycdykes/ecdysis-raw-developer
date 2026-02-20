const JPEG_SOI_FIRST = 0xff;
const JPEG_SOI_SECOND = 0xd8;
const JPEG_EOI_FIRST = 0xff;
const JPEG_EOI_SECOND = 0xd9;

export function findEmbeddedJpegRange(buffer, { minBytes = 4_096 } = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let bestRange = null;

  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] !== JPEG_SOI_FIRST || bytes[index + 1] !== JPEG_SOI_SECOND) {
      continue;
    }

    for (let tail = index + 2; tail < bytes.length - 1; tail += 1) {
      if (bytes[tail] === JPEG_EOI_FIRST && bytes[tail + 1] === JPEG_EOI_SECOND) {
        const end = tail + 2;
        const size = end - index;
        const isValid = size >= minBytes;

        if (isValid && (!bestRange || size > bestRange.size)) {
          bestRange = { start: index, end, size };
        }

        index = tail;
        break;
      }
    }
  }

  return bestRange;
}

export function extractEmbeddedJpegPreview(buffer, options = {}) {
  const range = findEmbeddedJpegRange(buffer, options);
  if (!range) {
    return null;
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return bytes.slice(range.start, range.end);
}
