import { useCallback } from 'react';
import type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';
import type { CameraLaunchContext } from '@/lib/camera/cameraLaunchContext';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';

/** Hook wrapper — returns a function that opens the snap flow from launch context. */
export function useOpenSnapCamera() {
  const ctx = useCameraOverlayOptional();
  return useCallback(
    (launchContext: CameraLaunchContext, extra?: Partial<OpenCameraOptions>) => {
      if (!ctx) return false;
      openSnapCamera(ctx.openCamera, launchContext, extra);
      return true;
    },
    [ctx],
  );
}
