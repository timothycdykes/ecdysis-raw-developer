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

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(h, s, l) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [chroma, x, 0];
  else if (hp < 2) [r, g, b] = [x, chroma, 0];
  else if (hp < 3) [r, g, b] = [0, chroma, x];
  else if (hp < 4) [r, g, b] = [0, x, chroma];
  else if (hp < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const match = l - chroma / 2;
  return {
    r: (r + match) * 255,
    g: (g + match) * 255,
    b: (b + match) * 255
  };
}

const MIXER_CHANNEL_CENTERS = {
  red: 0,
  orange: 32,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 280,
  magenta: 320
};

function circularHueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function getMixerBlend(hue, mixer = {}) {
  const channels = Object.entries(MIXER_CHANNEL_CENTERS);
  const sigma = 36;
  const weighted = channels.map(([name, center]) => {
    const distance = circularHueDistance(hue, center);
    const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
    return { weight, channel: mixer[name] };
  });

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return { hue: 0, saturation: 0, luminance: 0 };

  const blend = weighted.reduce((acc, entry) => {
    const ratio = entry.weight / totalWeight;
    acc.hue += (entry.channel?.hue ?? 0) * ratio;
    acc.saturation += (entry.channel?.saturation ?? 0) * ratio;
    acc.luminance += (entry.channel?.luminance ?? 0) * ratio;
    return acc;
  }, { hue: 0, saturation: 0, luminance: 0 });

  return blend;
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

      const hsl = rgbToHsl(r, g, b);
      const mixerBlend = getMixerBlend(hsl.h, adjustments.colorMixer);
      const hueShift = mixerBlend.hue * 0.5;
      const saturationShift = mixerBlend.saturation / 100;
      const luminanceShift = mixerBlend.luminance / 100;
      const chromaProtection = 0.45 + hsl.s * 0.55;

      hsl.h = (hsl.h + hueShift + 360) % 360;
      hsl.s = clampUnit(hsl.s * (1 + saturationShift * 0.9));
      hsl.l = clampUnit(hsl.l + luminanceShift * 0.24 * chromaProtection);

      const grade = adjustments.colorGrade;
      if (grade) {
        const pixelLightness = hsl.l;
        const shadowMask = 1 - smoothStep(0.1, 0.5, pixelLightness);
        const highlightMask = smoothStep(0.5, 0.95, pixelLightness);
        const midMask = Math.max(0, 1 - shadowMask - highlightMask);
        const balanceShift = grade.balance / 100;
        const blending = clampUnit(grade.blending / 100);

        const gradedHue =
          grade.shadows.hue * Math.max(0, shadowMask + (balanceShift * 0.3)) +
          grade.midtones.hue * midMask +
          grade.highlights.hue * Math.max(0, highlightMask - (balanceShift * 0.3)) +
          grade.global.hue * 0.2;
        const gradedSat =
          grade.shadows.saturation * shadowMask +
          grade.midtones.saturation * midMask +
          grade.highlights.saturation * highlightMask +
          grade.global.saturation * 0.25;
        const gradedLum =
          grade.shadows.luminance * shadowMask +
          grade.midtones.luminance * midMask +
          grade.highlights.luminance * highlightMask +
          grade.global.luminance * 0.25;

        const gradeAmount = blending * 0.01;
        hsl.h = (hsl.h * (1 - gradeAmount) + gradedHue * gradeAmount + 360) % 360;
        hsl.s = clampUnit(hsl.s + (gradedSat / 100) * blending * 0.35);
        hsl.l = clampUnit(hsl.l + (gradedLum / 100) * blending * 0.25);
      }

      const gradedRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      r = gradedRgb.r;
      g = gradedRgb.g;
      b = gradedRgb.b;

      output[i] = clamp(r * vignetteScale);
      output[i + 1] = clamp(g * vignetteScale);
      output[i + 2] = clamp(b * vignetteScale);
      output[i + 3] = a;
    }
  }

  return output;
}
