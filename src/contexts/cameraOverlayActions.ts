import type { CaptureTarget } from '@/lib/camera/cameraConfig';
import type { CameraLaunchContext } from '@/lib/camera/cameraLaunchContext';
import { captureTargetForContext } from '@/lib/camera/cameraLaunchContext';
import type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';

/** Open camera instantly; start getUserMedia in the same tap (mobile-safe). */
export function openCameraFromGesture(
  openCamera: (opts: OpenCameraOptions) => void,
  captureTarget: CaptureTarget,
  extra?: Partial<OpenCameraOptions>,
) {
  let streamPromise: Promise<MediaStream | null> | undefined;
  if (navigator.mediaDevices?.getUserMedia) {
    streamPromise = navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .catch(() => null);
  }

  openCamera({ captureTarget, streamPromise, ...extra });
}

/**
 * Open the snap capture → edit → send flow for a launch context.
 * The capture target (recording limits, mode tabs) derives from the context.
 */
export function openSnapCamera(
  openCamera: (opts: OpenCameraOptions) => void,
  launchContext: CameraLaunchContext,
  extra?: Partial<OpenCameraOptions>,
) {
  openCameraFromGesture(openCamera, captureTargetForContext(launchContext), {
    launchContext,
    ...extra,
  });
}
