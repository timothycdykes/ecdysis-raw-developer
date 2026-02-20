export const INLINE_PREVIEW_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"];

// Covers common RAW families across major camera manufacturers.
export const RAW_EXTENSIONS = [
  ".3fr", // Hasselblad
  ".ari", // ARRI
  ".arw", // Sony
  ".bay", // Casio
  ".braw", // Blackmagic
  ".cr2", // Canon
  ".cr3", // Canon
  ".crw", // Canon legacy
  ".dcr", // Kodak
  ".dng", // Adobe/Leica/etc.
  ".erf", // Epson
  ".fff", // Hasselblad
  ".iiq", // Phase One
  ".k25", // Kodak
  ".kdc", // Kodak
  ".mdc", // Minolta
  ".mef", // Mamiya
  ".mos", // Leaf/Mamiya
  ".mrw", // Minolta
  ".nef", // Nikon
  ".nrw", // Nikon
  ".orf", // Olympus
  ".pef", // Pentax
  ".ptx", // Pentax
  ".raf", // Fujifilm
  ".raw", // Generic fallback used by several vendors
  ".rwl", // Leica
  ".rw2", // Panasonic
  ".rwz", // Rawzor
  ".sr2", // Sony
  ".srf", // Sony
  ".srw", // Samsung
  ".x3f" // Sigma
];

export function supportsInlinePreview(fileName = "") {
  const lower = fileName.toLowerCase();
  return INLINE_PREVIEW_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isRawFile(fileName = "") {
  const lower = fileName.toLowerCase();
  return RAW_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
