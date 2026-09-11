import sharp from "sharp";

const MAX_HEADSHOT_DIMENSION = 1600;

/**
 * Applies EXIF orientation and removes orientation metadata. Audition uploads
 * and packet exports both use this path, so legacy and future images behave
 * identically without rewriting existing submission records.
 */
export async function normalizeAuditionHeadshot(source: Buffer) {
  return sharp(source, { failOn: "error" })
    .rotate()
    .resize(MAX_HEADSHOT_DIMENSION, MAX_HEADSHOT_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}
