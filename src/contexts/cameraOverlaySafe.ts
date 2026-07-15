/**
 * Safe camera-overlay hook accessors.
 * Guards against HMR/export races where named imports land as `undefined`
 * (which previously crashed CreateMenu / ChatView / Upload with
 * "useCameraOverlay* is not defined").
 */
import {
  useCameraOverlay as useCameraOverlayImpl,
  useCameraOverlayOptional as useCameraOverlayOptionalImpl,
  type CameraOverlayContextValue,
} from '@/contexts/cameraOverlayState';

const NOOP: CameraOverlayContextValue = {
  openCamera: () => {},
  closeCamera: () => {},
  isOpen: false,
};

function fallbackOptional(): CameraOverlayContextValue | null {
  return null;
}

function fallbackRequired(): CameraOverlayContextValue {
  return NOOP;
}

const optionalOk = typeof useCameraOverlayOptionalImpl === 'function';
const requiredOk = typeof useCameraOverlayImpl === 'function';

export const useCameraOverlayOptional: typeof useCameraOverlayOptionalImpl = optionalOk
  ? useCameraOverlayOptionalImpl
  : fallbackOptional;

export const useCameraOverlay: typeof useCameraOverlayImpl = requiredOk
  ? useCameraOverlayImpl
  : fallbackRequired;
