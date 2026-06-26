import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from '@/components/camera/Camera';
import { VybeSnapCamera } from '@/components/camera/VybeSnapCamera';
import type { CameraMode, CaptureTarget } from '@/lib/camera/cameraConfig';

export interface UnifiedVybeCameraProps {
  captureTarget: CaptureTarget;
  initialStream?: MediaStream | null;
  streamPromise?: Promise<MediaStream | null>;
  onClose: () => void;
  onSend?: (mediaUrl: string, isVideo: boolean) => void;
  onCapture?: (media: { file: File; url: string; type: 'photo' | 'video' }) => void;
  showBackArrow?: boolean;
  defaultMode?: CameraMode;
}

/**
 * Single camera surface for every entry point.
 * DM/Snap use VybeSnapCamera; Hub/Story/Post/Clip use the full Snapchat-style Camera.
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
}: UnifiedVybeCameraProps) {
  const navigate = useNavigate();

  const handleCapture = useCallback(
    (media: { file: File; url: string; type: 'photo' | 'video' }) => {
      if (onCapture) {
        onCapture(media);
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
    [captureTarget, navigate, onCapture, onClose],
  );

  if (captureTarget === 'dm' || captureTarget === 'snap') {
    return (
      <VybeSnapCamera
        isOpen
        onClose={onClose}
        directSend={captureTarget === 'dm'}
        onSend={(url, isVideo) => {
          onSend?.(url, isVideo);
          onClose();
        }}
        initialStream={initialStream}
        streamPromise={streamPromise}
      />
    );
  }

  return (
    <Camera
      onClose={onClose}
      initialStream={initialStream}
      streamPromise={streamPromise}
      captureTarget={captureTarget}
      defaultMode={defaultMode}
      showBackArrow={showBackArrow}
      onCapture={handleCapture}
    />
  );
}

export { VybeSnapEditor as UnifiedCameraPreview } from './VybeSnapEditor';
