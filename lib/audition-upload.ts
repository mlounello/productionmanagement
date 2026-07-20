export const MAX_AUDITION_UPLOAD_BYTES = 3 * 1024 * 1024;

export function auditionUploadSizeLabel(bytes = MAX_AUDITION_UPLOAD_BYTES) {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

export function auditionUploadTooLarge(file: { size: number }) {
  return file.size > MAX_AUDITION_UPLOAD_BYTES;
}
