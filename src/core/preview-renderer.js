function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(edge0, edge1, x) {
  const t = clampUnit((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function rgbToLuma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function applyWhiteBalance(r, g, b, tempKelvin, tint) {
  const neutralKelvin = 5500;
  const kelvinSpread = 3500;
  const tempScale = clampUnit((tempKelvin - neutralKelvin) / kelvinSpread / 2 + 0.5) * 2 - 1;
  const tintScale = tint / 100;

  const red = r * (1 + tempScale * 0.22);
  const blue = b * (1 - tempScale * 0.22);
  const green = g * (1 + tintScale * 0.14);

  return [red, green, blue];
}

function applyGlobalTone(value, exposure, contrast) {
  const exposureScale = 2 ** exposure;
  let linear = (value / 255) * exposureScale;

  const contrastAmount = contrast / 100;
  linear = ((linear - 0.5) * (1 + contrastAmount)) + 0.5;
  return clamp(linear * 255);
}

function applyLightBands(luma, highlights, shadows, whites, blacks) {
  const highlightMask = smoothStep(0.45, 1, luma);
  const shadowMask = 1 - smoothStep(0, 0.55, luma);
  const whiteMask = smoothStep(0.75, 1, luma);
  const blackMask = 1 - smoothStep(0, 0.25, luma);

  return (
    (highlights / 100) * 42 * highlightMask +
    (shadows / 100) * 46 * shadowMask +
    (whites / 100) * 32 * whiteMask +
    (blacks / 100) * 32 * blackMask
  );
}

function applySaturationAndVibrance(r, g, b, saturation, vibrance) {
  const satScale = 1 + saturation / 100;
  const vrbScale = vibrance / 100;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = (max - min) / 255;
  const luma = rgbToLuma(r, g, b) * 255;

  const adaptiveBoost = vrbScale * (1 - chroma);
  const totalScale = Math.max(0, satScale + adaptiveBoost);

  return [
    clamp(luma + (r - luma) * totalScale),
    clamp(luma + (g - luma) * totalScale),
    clamp(luma + (b - luma) * totalScale)
  ];
}

function applyPresence(r, g, b, clarity, texture, dehaze) {
  const luma = rgbToLuma(r, g, b) * 255;
  const clarityAmount = clarity / 100;
  const textureAmount = texture / 100;
  const dehazeAmount = dehaze / 100;

  const midtone = smoothStep(0.2, 0.8, luma / 255) - smoothStep(0.8, 1, luma / 255);
  const textureScale = 1 + textureAmount * 0.35;
  const clarityScale = 1 + clarityAmount * 0.3 * midtone;
  const dehazeScale = 1 + dehazeAmount * 0.45;

  return [
    clamp(luma + (r - luma) * textureScale * clarityScale * dehazeScale),
    clamp(luma + (g - luma) * textureScale * clarityScale * dehazeScale),
    clamp(luma + (b - luma) * textureScale * clarityScale * dehazeScale)
  ];
}

function vignetteAmount(x, y, width, height, vignette) {
  if (!vignette) return 1;
  const nx = (x / width) * 2 - 1;
  const ny = (y / height) * 2 - 1;
  const distance = Math.sqrt(nx * nx + ny * ny);
  const edge = smoothStep(0.45, 1.25, distance);
  return 1 - (vignette / 100) * 0.65 * edge;
}

export function processPreviewPixels(data, width, height, adjustments) {
  const output = new Uint8ClampedArray(data.length);

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = (py * width + px) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];

      [r, g, b] = applyWhiteBalance(r, g, b, adjustments.whiteBalanceTemp, adjustments.whiteBalanceTint);

      r = applyGlobalTone(r, adjustments.exposure, adjustments.contrast);
      g = applyGlobalTone(g, adjustments.exposure, adjustments.contrast);
      b = applyGlobalTone(b, adjustments.exposure, adjustments.contrast);

      const luma = rgbToLuma(r, g, b);
      const lightDelta = applyLightBands(
        luma,
        adjustments.highlights,
        adjustments.shadows,
        adjustments.whites,
        adjustments.blacks
      );

      r = clamp(r + lightDelta);
      g = clamp(g + lightDelta);
      b = clamp(b + lightDelta);

      [r, g, b] = applySaturationAndVibrance(r, g, b, adjustments.saturation, adjustments.vibrance);
      [r, g, b] = applyPresence(r, g, b, adjustments.clarity, adjustments.texture, adjustments.dehaze);

      const vignetteScale = vignetteAmount(px, py, width, height, adjustments.vignette);

      output[i] = clamp(r * vignetteScale);
      output[i + 1] = clamp(g * vignetteScale);
      output[i + 2] = clamp(b * vignetteScale);
      output[i + 3] = a;
    }
  }

  return output;
}
