import type { CameraMode, CaptureTarget } from '@/lib/camera/cameraConfig';
import type { CameraLaunchContext } from '@/lib/camera/cameraLaunchContext';

export interface OpenCameraOptions {
  captureTarget: CaptureTarget;
  /** Pre-acquired stream from the tap gesture (required on mobile WebViews). */
  initialStream?: MediaStream | null;
  /** getUserMedia promise started during the tap — overlay opens instantly while this resolves. */
  streamPromise?: Promise<MediaStream | null>;
  onSend?: (mediaUrl: string, isVideo: boolean) => void;
  onCapture?: (media: { file: File; url: string; type: 'photo' | 'video' }) => void;
  showBackArrow?: boolean;
  defaultMode?: CameraMode;
  onDismiss?: () => void;
  /** Snap capture → edit → send flow — every entry point should pass this. */
  launchContext?: CameraLaunchContext;
}
