/** Pick a MediaRecorder mime type supported on this device (Android WebView often lacks webm). */
export function pickCameraRecordingMime(): string | undefined {
  const candidates = [
    'video/mp4',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime)) {
      return mime;
    }
  }
  return undefined;
}

/** Create MediaRecorder without throwing when webm is unsupported (common native WebView crash). */
export function createCameraMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickCameraRecordingMime();
  try {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (err) {
    console.warn('[cameraRecording] MediaRecorder with mime failed, using default:', err);
    return new MediaRecorder(stream);
  }
}

export function recordingBlobType(mimeType?: string): string {
  if (mimeType?.includes('mp4')) return 'video/mp4';
  if (mimeType?.includes('webm')) return 'video/webm';
  return mimeType || 'video/mp4';
}
