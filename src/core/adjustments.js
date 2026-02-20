export const DEFAULT_ADJUSTMENTS = Object.freeze({
  cameraProfile: "adobeColor",
  profileAmount: 100,
  treatment: "color",
  whiteBalanceTemp: 5500,
  whiteBalanceTint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  clarity: 0,
  texture: 0,
  dehaze: 0,
  vignette: 0,
  toneCurve: {
    rgb: [0, 0.25, 0.5, 0.75, 1],
    red: [0, 0.25, 0.5, 0.75, 1],
    green: [0, 0.25, 0.5, 0.75, 1],
    blue: [0, 0.25, 0.5, 0.75, 1]
  },
  colorMixer: {
    red: { hue: 0, saturation: 0, luminance: 0 },
    orange: { hue: 0, saturation: 0, luminance: 0 },
    yellow: { hue: 0, saturation: 0, luminance: 0 },
    green: { hue: 0, saturation: 0, luminance: 0 },
    aqua: { hue: 0, saturation: 0, luminance: 0 },
    blue: { hue: 0, saturation: 0, luminance: 0 },
    purple: { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 }
  },
  colorGrade: {
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    global: { hue: 0, saturation: 0, luminance: 0 },
    blending: 50,
    balance: 0
  }
});

export const COPY_GROUPS = {
  profile: ["cameraProfile", "profileAmount", "treatment"],
  whiteBalance: ["whiteBalanceTemp", "whiteBalanceTint"],
  light: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"],
  color: ["saturation", "vibrance", "cameraProfile", "profileAmount", "treatment"],
  effects: ["clarity", "texture", "dehaze", "vignette"],
  curves: ["toneCurve"],
  mixer: ["colorMixer"],
  grade: ["colorGrade"]
};

export function deepClone(value) {
  return structuredClone(value);
}

export function extractAdjustments(adjustments, includedGroups = Object.keys(COPY_GROUPS)) {
  const selectedKeys = includedGroups.flatMap((group) => COPY_GROUPS[group] ?? []);
  const output = {};

  selectedKeys.forEach((key) => {
    output[key] = deepClone(adjustments[key]);
  });

  return output;
}

export function mergeAdjustments(target, source) {
  const merged = deepClone(target);

  Object.entries(source).forEach(([key, value]) => {
    merged[key] = deepClone(value);
  });

  return merged;
}
