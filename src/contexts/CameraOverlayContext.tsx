import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { UnifiedVybeCamera } from '@/components/camera/UnifiedVybeCamera';
import { SnapSendProgress } from '@/components/camera/SnapSendProgress';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { stopCameraStream } from '@/hooks/useCameraPreload';
import type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';
import { CameraOverlayContext } from '@/contexts/cameraOverlayState';

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
              launchContext={state.launchContext}
            />
          </CameraMountBoundary>
        </FullscreenPortal>
      )}
      <SnapSendProgress />
    </CameraOverlayContext.Provider>
  );
}
