/** Pick a MediaRecorder mime type supported on this device (Android WebView often lacks webm). */
export function pickCameraRecordingMime(): string | undefined {
  const candidates = [
    // Prefer webm when available — timesliced recordings play reliably in <video>.
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    // Safari / iOS WKWebView: mp4 only (no timeslice — see startCameraRecorder).
    'video/mp4',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime)) {
      return mime;
    }
  }
  return undefined;
}

/** Create MediaRecorder without throwing when preferred mime is unsupported. */
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
  if (!mimeType) return 'video/webm';
  if (mimeType.includes('mp4')) return 'video/mp4';
  if (mimeType.includes('webm')) return 'video/webm';
  return mimeType;
}

/** Resolve container type from recorder + chunks (chunk.type is most accurate). */
export function resolveRecordingBlobType(recorder: MediaRecorder, chunks: Blob[]): string {
  const fromChunk = chunks.find((c) => c.type)?.type;
  return recordingBlobType(fromChunk || recorder.mimeType || undefined);
}

export function recordingFileExtension(blobType: string): 'mp4' | 'webm' {
  return blobType.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * mp4 MediaRecorder timeslices often produce unplayable blobs in <video>.
 * Start without a timeslice for mp4; use a modest timeslice for webm.
 */
export function startCameraRecorder(recorder: MediaRecorder, timesliceMs = 250): void {
  const mime = recorder.mimeType || '';
  if (mime.includes('mp4')) {
    recorder.start();
  } else {
    recorder.start(timesliceMs);
  }
}

export function buildRecordingFile(
  chunks: Blob[],
  recorder: MediaRecorder,
  namePrefix = 'camera-video',
): { blob: Blob; file: File; blobType: string } {
  const blobType = resolveRecordingBlobType(recorder, chunks);
  const blob = new Blob(chunks, { type: blobType });
  const ext = recordingFileExtension(blobType);
  const file = new File([blob], `${namePrefix}.${ext}`, { type: blobType });
  return { blob, file, blobType };
}
