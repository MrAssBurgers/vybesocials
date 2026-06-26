import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { UnifiedVybeCamera } from '@/components/camera/UnifiedVybeCamera';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import type { CameraMode, CaptureTarget } from '@/lib/camera/cameraConfig';
import { stopCameraStream } from '@/hooks/useCameraPreload';

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
}

interface CameraOverlayContextValue {
  openCamera: (options: OpenCameraOptions) => void;
  closeCamera: () => void;
  isOpen: boolean;
}

const CameraOverlayContext = createContext<CameraOverlayContextValue | null>(null);

export function CameraOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenCameraOptions | null>(null);

  const closeCamera = useCallback(() => {
    setState((prev) => {
      prev?.onDismiss?.();
      return null;
    });
    stopCameraStream();
  }, []);

  const openCamera = useCallback((options: OpenCameraOptions) => {
    setState(options);
  }, []);

  useEffect(() => {
    if (!state) {
      document.documentElement.removeAttribute('data-camera-open');
      return;
    }
    document.documentElement.setAttribute('data-camera-open', 'true');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.removeAttribute('data-camera-open');
      document.body.style.overflow = prevOverflow;
    };
  }, [state]);

  const value = useMemo(
    () => ({
      openCamera,
      closeCamera,
      isOpen: !!state,
    }),
    [openCamera, closeCamera, state],
  );

  return (
    <CameraOverlayContext.Provider value={value}>
      {children}
      {state && (
        <FullscreenPortal>
          <CameraMountBoundary onError={closeCamera} surface="camera-overlay">
            <UnifiedVybeCamera
              captureTarget={state.captureTarget}
              initialStream={state.initialStream}
              streamPromise={state.streamPromise}
              onClose={closeCamera}
              onSend={state.onSend}
              onCapture={state.onCapture}
              showBackArrow={state.showBackArrow}
              defaultMode={state.defaultMode}
            />
          </CameraMountBoundary>
        </FullscreenPortal>
      )}
    </CameraOverlayContext.Provider>
  );
}

export function useCameraOverlay() {
  const ctx = useContext(CameraOverlayContext);
  if (!ctx) throw new Error('useCameraOverlay must be used within CameraOverlayProvider');
  return ctx;
}

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
