import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { stopCameraStream } from '@/hooks/useCameraPreload';
import type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';
import { CameraOverlayContext } from '@/contexts/cameraOverlayState';

// The camera and its upload progress stay out of the first-paint entry.
// They load on the gesture that opens the camera, then progress stays mounted
// so a send can finish after the camera closes.
const UnifiedVybeCamera = lazy(() => import('@/components/camera/UnifiedVybeCamera').then(m => ({ default: m.UnifiedVybeCamera })));
const SnapSendProgress = lazy(() => import('@/components/camera/SnapSendProgress').then(m => ({ default: m.SnapSendProgress })));

// Re-exports kept for compatibility — prefer importing hooks from
// `@/contexts/cameraOverlayState` and helpers from `@/contexts/cameraOverlayActions`.
export type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';
export {
  useCameraOverlay,
  useCameraOverlayOptional,
} from '@/contexts/cameraOverlayState';
export {
  openCameraFromGesture,
  openSnapCamera,
} from '@/contexts/cameraOverlayActions';
export { useOpenSnapCamera } from '@/contexts/cameraOverlayHooks';

export function CameraOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenCameraOptions | null>(null);
  const [sendProgressArmed, setSendProgressArmed] = useState(false);

  const closeCamera = useCallback(() => {
    setState((prev) => {
      prev?.onDismiss?.();
      return null;
    });
    stopCameraStream();
  }, []);

  const openCamera = useCallback((options: OpenCameraOptions) => {
    setSendProgressArmed(true);
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
            <Suspense fallback={null}>
              <UnifiedVybeCamera
                captureTarget={state.captureTarget}
                initialStream={state.initialStream}
                streamPromise={state.streamPromise}
                onClose={closeCamera}
                onSend={state.onSend}
                onCapture={state.onCapture}
                showBackArrow={state.showBackArrow}
                defaultMode={state.defaultMode}
                launchContext={state.launchContext}
              />
            </Suspense>
          </CameraMountBoundary>
        </FullscreenPortal>
      )}
      {sendProgressArmed && (
        <Suspense fallback={null}>
          <SnapSendProgress />
        </Suspense>
      )}
    </CameraOverlayContext.Provider>
  );
}
