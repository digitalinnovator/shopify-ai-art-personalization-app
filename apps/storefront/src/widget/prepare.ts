/**
 * Shrinks very large photos in the browser before upload. Phone cameras produce 4000 px, 5 to
 * 10 MB files; the models work from about 2000 px, and the upload travels through Shopify's app
 * proxy, so sending less is faster for the customer and kinder to the limits. Orientation is
 * applied from the photo's own metadata, and anything unexpected falls back to the original file.
 */
const MAX_EDGE = 2048;
const SKIP_BELOW_BYTES = 1024 * 1024;

export async function prepareForUpload(file: File): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MAX_EDGE) {
      bitmap.close();
      return file;
    }
    const scale = MAX_EDGE / longEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
