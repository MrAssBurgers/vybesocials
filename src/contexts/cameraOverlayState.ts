import { createContext, useContext, type ReactNode } from 'react';
import type { OpenCameraOptions } from '@/contexts/cameraOverlayTypes';

export type { OpenCameraOptions };

export interface CameraOverlayContextValue {
  openCamera: (options: OpenCameraOptions) => void;
  closeCamera: () => void;
  isOpen: boolean;
}

/** Shared context object — keep this file free of camera UI imports to avoid init/HMR races. */
export const CameraOverlayContext = createContext<CameraOverlayContextValue | null>(null);

const NOOP_CAMERA: CameraOverlayContextValue = {
  openCamera: () => {
    if (import.meta.env.DEV) {
      console.warn('[CameraOverlay] openCamera called without CameraOverlayProvider');
    }
  },
  closeCamera: () => {},
  isOpen: false,
};

/** Non-throwing access for surfaces that may mount outside the provider. */
export function useCameraOverlayOptional(): CameraOverlayContextValue | null {
  return useContext(CameraOverlayContext);
}

/**
 * Preferred hook for app chrome. Soft-falls back to no-ops instead of throwing,
 * so a missing provider (or stale HMR context) never takes down Home/Messages.
 */
export function useCameraOverlay(): CameraOverlayContextValue {
  return useContext(CameraOverlayContext) ?? NOOP_CAMERA;
}

export type CameraOverlayProviderProps = { children: ReactNode };
