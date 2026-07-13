import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from '@/components/camera/Camera';
import type { CameraMode, CaptureTarget } from '@/lib/camera/cameraConfig';
import { defaultModeForTarget } from '@/lib/camera/cameraConfig';
import type { CameraLaunchContext } from '@/lib/camera/cameraLaunchContext';

export interface UnifiedVybeCameraProps {
  captureTarget: CaptureTarget;
  initialStream?: MediaStream | null;
  streamPromise?: Promise<MediaStream | null>;
  onClose: () => void;
  onSend?: (mediaUrl: string, isVideo: boolean) => void;
  onCapture?: (media: { file: File; url: string; type: 'photo' | 'video' }) => void;
  showBackArrow?: boolean;
  defaultMode?: CameraMode;
  /** Snap capture → edit → send flow (see cameraLaunchContext.ts). */
  launchContext?: CameraLaunchContext;
}

/**
 * Single camera engine for every entry point (Story, VybeSnap, Create, Profile, etc.).
 * All surfaces use the same Camera component — identical UI, gestures, and capture flow.
 */
export function UnifiedVybeCamera({
  captureTarget,
  initialStream,
  streamPromise,
  onClose,
  onSend,
  onCapture,
  showBackArrow,
  defaultMode,
  launchContext,
}: UnifiedVybeCameraProps) {
  const navigate = useNavigate();

  const handleCapture = useCallback(
    (media: { file: File; url: string; type: 'photo' | 'video' }) => {
      if (onCapture) {
        onCapture(media);
        onClose();
        return;
      }
      if (onSend) {
        onSend(media.url, media.type === 'video');
        onClose();
        return;
      }
      onClose();
      navigate('/upload', {
        state: {
          prefillMedia: media,
          captureTarget,
        },
      });
    },
    [captureTarget, navigate, onCapture, onClose, onSend],
  );

  if (launchContext) {
    // Snap flow: the editor + Send To + background send own the whole
    // post-capture path — no legacy short-circuits.
    return (
      <Camera
        onClose={onClose}
        initialStream={initialStream}
        streamPromise={streamPromise}
        captureTarget={captureTarget}
        defaultMode={defaultMode ?? defaultModeForTarget(captureTarget)}
        showBackArrow={showBackArrow}
        launchContext={launchContext}
      />
    );
  }

  return (
    <Camera
      onClose={onClose}
      initialStream={initialStream}
      streamPromise={streamPromise}
      captureTarget={captureTarget}
      defaultMode={defaultMode ?? defaultModeForTarget(captureTarget)}
      showBackArrow={showBackArrow}
      onCapture={onCapture ?? (captureTarget !== 'story' ? handleCapture : undefined)}
      onSend={onSend}
      directSend={captureTarget === 'dm' || captureTarget === 'snap'}
    />
  );
}

export { VybeSnapEditor as UnifiedCameraPreview } from './VybeSnapEditor';
