import { describe, expect, it } from 'vitest';
import {
  recordingBlobType,
  recordingFileExtension,
  resolveRecordingBlobType,
} from './cameraRecording';

describe('cameraRecording helpers', () => {
  it('normalizes mime from recorder/chunk types', () => {
    expect(recordingBlobType('video/webm;codecs=vp9')).toBe('video/webm');
    expect(recordingBlobType('video/mp4')).toBe('video/mp4');
    expect(recordingBlobType(undefined)).toBe('video/webm');
  });

  it('prefers chunk type over empty recorder mime', () => {
    const recorder = { mimeType: '' } as MediaRecorder;
    const chunks = [new Blob(['x'], { type: 'video/webm;codecs=vp8' })];
    expect(resolveRecordingBlobType(recorder, chunks)).toBe('video/webm');
  });

  it('picks file extension from blob type', () => {
    expect(recordingFileExtension('video/mp4')).toBe('mp4');
    expect(recordingFileExtension('video/webm')).toBe('webm');
  });
});
