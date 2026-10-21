/*
 * The types of the files users upload. The server serves them back from the
 * app's own address, so the type a browser renders one as must be one of
 * these, never the type the uploading client declares: a "portrait.png"
 * declared text/html, opened from a link, ran its script on DiceCloud's
 * origin, where the session's token is (fileResponseHeaders.ts serves them).
 */

/** The image types users upload, with the extensions of each */
export const IMAGE_TYPES: Readonly<Record<string, readonly string[]>> = {
  'image/gif': ['gif'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
};

/** Why a file cannot be uploaded as an image: an allowed type, with an extension of that type */
export function imageTypeError(file: { type?: string, extension?: string }): string | undefined {
  const extensions = Object.hasOwn(IMAGE_TYPES, file.type ?? '') ? IMAGE_TYPES[file.type as string] : undefined;
  if (!extensions?.includes((file.extension ?? '').toLowerCase())) {
    return 'Please upload a GIF, PNG, JPEG or WebP image';
  }
}

/** The type an image is served as: its own when allowed, else none a browser renders */
export function servedImageType(type?: string) {
  return type && Object.hasOwn(IMAGE_TYPES, type) ? type : 'application/octet-stream';
}
