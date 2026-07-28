export type PhotoEnhancementPreset =
  | 'auto'
  | 'vibrant'
  | 'portrait'
  | 'aesthetic'
  | 'hdr'
  | 'clean';

export function photoEnhancementFilter(preset: PhotoEnhancementPreset): string {
  switch (preset) {
    case 'vibrant':
      return 'saturate(1.32) contrast(1.08) brightness(1.03)';
    case 'portrait':
      return 'brightness(1.05) contrast(1.03) saturate(0.96) sepia(0.035)';
    case 'aesthetic':
      return 'contrast(1.06) saturate(0.9) sepia(0.09) brightness(1.02)';
    case 'hdr':
      return 'contrast(1.18) saturate(1.16) brightness(1.01)';
    case 'clean':
      return 'brightness(1.07) contrast(1.08) saturate(0.94)';
    default:
      return 'brightness(1.035) contrast(1.08) saturate(1.1)';
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not open this image.'));
    };
    image.src = url;
  });
}

/** Fast, private preview enhancement with no network request. */
export async function enhancePhotoLocally(
  file: File,
  preset: PhotoEnhancementPreset,
): Promise<string> {
  const image = await loadImage(file);
  const maxDimension = 2560;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable on this device.');

  context.filter = photoEnhancementFilter(preset);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
