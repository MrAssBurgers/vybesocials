import type { CameraLaunchSource } from '@/lib/camera/cameraLaunchContext';
import type { SnapViewMode } from '@/lib/camera/snapDraft';
import {
  failedDestinations,
  type SnapDestinationStatus,
  type SnapJobPhase,
} from '@/lib/camera/snapSendStateMachine';

/** Global camera multi-send keeps the overlay open for the next capture. */
export function shouldStayOnCameraAfterSend(source: CameraLaunchSource): boolean {
  return source === 'global';
}

export function globalSendConfirmationText(destinationCount: number): string {
  if (destinationCount <= 0) return 'Sent';
  return destinationCount === 1 ? 'Sent to 1' : `Sent to ${destinationCount}`;
}

export function shouldAnimateSnapSend(
  animateOnSend: boolean,
  prefersReducedMotion: boolean | null,
): boolean {
  return animateOnSend && !prefersReducedMotion;
}

export function isEphemeralViewMode(mode: SnapViewMode): boolean {
  return mode === 'view_once' || mode === 'replay_once';
}

export function shouldShowOfflineWaitingLabel(
  mode: SnapViewMode,
  phase: SnapJobPhase,
): boolean {
  return isEphemeralViewMode(mode) && phase === 'waiting_for_connection';
}

export function shouldShowRetryFailedOnly(
  phase: SnapJobPhase,
  destinations: SnapDestinationStatus[],
): boolean {
  return (
    phase === 'failed' ||
    phase === 'partially_sent' ||
    failedDestinations(destinations).length > 0
  );
}
