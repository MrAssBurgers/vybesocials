import { extractVideoFrames, framesToPayload } from './extractVideoFrames';

export interface VybeFramePayload {
  base64: string;
  mime_type: string;
  timestamp_sec?: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert image or video File into Vybe Check frame payloads. */
export async function fileToVybeFrames(file: File): Promise<VybeFramePayload[]> {
  if (file.type.startsWith('video/')) {
    return framesToPayload(await extractVideoFrames(file));
  }
  const base64 = await blobToBase64(file);
  return [{
    base64,
    mime_type: file.type || 'image/jpeg',
    timestamp_sec: 0,
  }];
}
