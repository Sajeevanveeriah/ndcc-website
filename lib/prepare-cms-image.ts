/** Resize print-resolution posters before transfer; server decoding stays bounded. */
export async function prepareCmsImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This image cannot be opened. Export it as JPEG, PNG or WebP and try again.'));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && file.size <= 4 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser. Try another browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image preparation failed. Please try again.')), 'image/webp', 0.85);
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type });
  } finally { URL.revokeObjectURL(objectUrl); }
}
