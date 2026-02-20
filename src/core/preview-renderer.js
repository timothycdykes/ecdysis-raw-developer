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

function sampleToneCurve(curve, value) {
  if (!Array.isArray(curve) || curve.length < 2) return clampUnit(value);
  const clampedValue = clampUnit(value);
  const scaled = clampedValue * (curve.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(curve.length - 1, index + 1);
  const mix = scaled - index;
  const left = clampUnit(curve[index]);
  const right = clampUnit(curve[nextIndex]);
  return left + (right - left) * mix;
}

function rgbToHsl(r, g, b, out) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = lightness;
    return out;
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  out[0] = hue;
  out[1] = saturation;
  out[2] = lightness;
  return out;
}

function hslToRgb(h, s, l, out) {
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
  out[0] = (r + match) * 255;
  out[1] = (g + match) * 255;
  out[2] = (b + match) * 255;
  return out;
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

const MIXER_CHANNELS = Object.keys(MIXER_CHANNEL_CENTERS);
const MIXER_SIGMA_SQUARED = 2 * 36 * 36;

function buildMixerLookupTable(mixer = {}) {
  const hueLut = new Float32Array(360);
  const satLut = new Float32Array(360);
  const lumLut = new Float32Array(360);

  for (let hue = 0; hue < 360; hue += 1) {
    let totalWeight = 0;
    let hueSum = 0;
    let satSum = 0;
    let lumSum = 0;

    for (const name of MIXER_CHANNELS) {
      const center = MIXER_CHANNEL_CENTERS[name];
      const distance = circularHueDistance(hue, center);
      const weight = Math.exp(-(distance * distance) / MIXER_SIGMA_SQUARED);
      const channel = mixer[name];
      hueSum += weight * (channel?.hue ?? 0);
      satSum += weight * (channel?.saturation ?? 0);
      lumSum += weight * (channel?.luminance ?? 0);
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      const inv = 1 / totalWeight;
      hueLut[hue] = hueSum * inv;
      satLut[hue] = satSum * inv;
      lumLut[hue] = lumSum * inv;
    }
  }

  return { hueLut, satLut, lumLut };
}

export function processPreviewPixels(data, width, height, adjustments) {
  const output = new Uint8ClampedArray(data.length);
  const hsl = [0, 0, 0];
  const rgb = [0, 0, 0];
  const mixerLut = buildMixerLookupTable(adjustments.colorMixer);

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

      const toneCurve = adjustments.toneCurve;
      if (toneCurve) {
        const rgbCurve = toneCurve.rgb;
        const redCurve = toneCurve.red;
        const greenCurve = toneCurve.green;
        const blueCurve = toneCurve.blue;

        const masterR = sampleToneCurve(rgbCurve, r / 255);
        const masterG = sampleToneCurve(rgbCurve, g / 255);
        const masterB = sampleToneCurve(rgbCurve, b / 255);

        r = sampleToneCurve(redCurve, masterR) * 255;
        g = sampleToneCurve(greenCurve, masterG) * 255;
        b = sampleToneCurve(blueCurve, masterB) * 255;
      }

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

      rgbToHsl(r, g, b, hsl);
      const hueIndex = Math.max(0, Math.min(359, Math.round(hsl[0]) % 360));
      const hueShift = mixerLut.hueLut[hueIndex] * 0.5;
      const saturationShift = mixerLut.satLut[hueIndex] / 100;
      const luminanceShift = mixerLut.lumLut[hueIndex] / 100;
      const chromaProtection = 0.45 + hsl[1] * 0.55;

      hsl[0] = (hsl[0] + hueShift + 360) % 360;
      hsl[1] = clampUnit(hsl[1] * (1 + saturationShift * 0.9));
      hsl[2] = clampUnit(hsl[2] + luminanceShift * 0.24 * chromaProtection);

      const grade = adjustments.colorGrade;
      if (grade) {
        const pixelLightness = hsl[2];
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
        hsl[0] = (hsl[0] * (1 - gradeAmount) + gradedHue * gradeAmount + 360) % 360;
        hsl[1] = clampUnit(hsl[1] + (gradedSat / 100) * blending * 0.35);
        hsl[2] = clampUnit(hsl[2] + (gradedLum / 100) * blending * 0.25);
      }

      hslToRgb(hsl[0], hsl[1], hsl[2], rgb);
      r = rgb[0];
      g = rgb[1];
      b = rgb[2];

      output[i] = clamp(r * vignetteScale);
      output[i + 1] = clamp(g * vignetteScale);
      output[i + 2] = clamp(b * vignetteScale);
      output[i + 3] = a;
    }
  }

  return output;
}
