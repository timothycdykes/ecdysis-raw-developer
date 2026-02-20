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

export function processPreviewPixels(data, width, height, adjustments) {
  const output = new Uint8ClampedArray(data.length);

  const exposureScale = 2 ** adjustments.exposure;
  const contrastAmount = adjustments.contrast / 100;
  const satScale = 1 + adjustments.saturation / 100;
  const vibranceScale = adjustments.vibrance / 100;

  const neutralKelvin = 5500;
  const kelvinSpread = 3500;
  const tempScale = clampUnit((adjustments.whiteBalanceTemp - neutralKelvin) / kelvinSpread / 2 + 0.5) * 2 - 1;
  const tintScale = adjustments.whiteBalanceTint / 100;

  const highlights = adjustments.highlights;
  const shadows = adjustments.shadows;
  const whites = adjustments.whites;
  const blacks = adjustments.blacks;

  const clarityAmount = adjustments.clarity / 100;
  const textureAmount = adjustments.texture / 100;
  const dehazeAmount = adjustments.dehaze / 100;
  const vignette = adjustments.vignette;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = (py * width + px) * 4;
      let r = data[i] * (1 + tempScale * 0.22);
      let g = data[i + 1] * (1 + tintScale * 0.14);
      let b = data[i + 2] * (1 - tempScale * 0.22);
      const a = data[i + 3];

      r = ((((r / 255) * exposureScale) - 0.5) * (1 + contrastAmount) + 0.5) * 255;
      g = ((((g / 255) * exposureScale) - 0.5) * (1 + contrastAmount) + 0.5) * 255;
      b = ((((b / 255) * exposureScale) - 0.5) * (1 + contrastAmount) + 0.5) * 255;

      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const highlightMask = smoothStep(0.45, 1, luma);
      const shadowMask = 1 - smoothStep(0, 0.55, luma);
      const whiteMask = smoothStep(0.75, 1, luma);
      const blackMask = 1 - smoothStep(0, 0.25, luma);

      const lightDelta = (
        (highlights / 100) * 42 * highlightMask +
        (shadows / 100) * 46 * shadowMask +
        (whites / 100) * 32 * whiteMask +
        (blacks / 100) * 32 * blackMask
      );

      r = clamp(r + lightDelta);
      g = clamp(g + lightDelta);
      b = clamp(b + lightDelta);

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = (max - min) / 255;
      const weightedLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const adaptiveBoost = vibranceScale * (1 - chroma);
      const totalScale = Math.max(0, satScale + adaptiveBoost);

      r = clamp(weightedLuma + (r - weightedLuma) * totalScale);
      g = clamp(weightedLuma + (g - weightedLuma) * totalScale);
      b = clamp(weightedLuma + (b - weightedLuma) * totalScale);

      const luma255 = (0.2126 * r + 0.7152 * g + 0.0722 * b);
      const lumaUnit = luma255 / 255;
      const midtone = smoothStep(0.2, 0.8, lumaUnit) - smoothStep(0.8, 1, lumaUnit);
      const textureScale = 1 + textureAmount * 0.35;
      const clarityScale = 1 + clarityAmount * 0.3 * midtone;
      const dehazeScale = 1 + dehazeAmount * 0.45;
      const presenceScale = textureScale * clarityScale * dehazeScale;

      r = clamp(luma255 + (r - luma255) * presenceScale);
      g = clamp(luma255 + (g - luma255) * presenceScale);
      b = clamp(luma255 + (b - luma255) * presenceScale);

      let vignetteScale = 1;
      if (vignette) {
        const nx = (px / width) * 2 - 1;
        const ny = (py / height) * 2 - 1;
        const distance = Math.sqrt(nx * nx + ny * ny);
        const edge = smoothStep(0.45, 1.25, distance);
        vignetteScale = 1 - (vignette / 100) * 0.65 * edge;
      }

      output[i] = clamp(r * vignetteScale);
      output[i + 1] = clamp(g * vignetteScale);
      output[i + 2] = clamp(b * vignetteScale);
      output[i + 3] = a;
    }
  }

  return output;
}
