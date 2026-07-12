/**
 * Unified screenshot / screen-recording detection for DMs and media viewers.
 * Wraps heuristic web detectors; native shells may inject higher-confidence events.
 */
import { useCaptureDetection } from '@/hooks/useCaptureDetection';
import { useScreenCapture } from '@/hooks/useScreenCapture';

export type CaptureEventType =
  | 'screenshot_chat'
  | 'screenshot_disappearing_photo'
  | 'screenshot_disappearing_video'
  | 'screenshot_profile'
  | 'screenshot_story'
  | 'screen_record_start'
  | 'screen_record_stop';

export type CaptureSeverity = 'low' | 'medium' | 'high';

export interface CaptureAlertPayload {
  eventType: CaptureEventType;
  severity: CaptureSeverity;
  conversationId?: string;
  messageId?: string;
  mediaId?: string;
  capturedByUserId?: string;
  capturedByDisplayName?: string;
  timestamp: number;
  platform: string;
  confidence: 'low' | 'medium' | 'high';
  recordingDurationMs?: number;
}

export function severityForEventType(type: CaptureEventType): CaptureSeverity {
  if (
    type === 'screenshot_disappearing_photo' ||
    type === 'screenshot_disappearing_video' ||
    type === 'screen_record_start'
  ) {
    return 'high';
  }
  if (type === 'screenshot_profile' || type === 'screenshot_story') {
    return 'medium';
  }
  return 'low';
}

export function buildCaptureEventKey(payload: Pick<CaptureAlertPayload, 'eventType' | 'conversationId' | 'messageId' | 'capturedByUserId' | 'timestamp'>): string {
  const bucket = Math.floor(payload.timestamp / 5000);
  return [
    payload.eventType,
    payload.conversationId ?? '',
    payload.messageId ?? '',
    payload.capturedByUserId ?? '',
    String(bucket),
  ].join(':');
}

/** Map legacy detector types to canonical event types. */
export function mapLegacyCaptureType(
  type: string,
  options?: { isDisappearingMedia?: boolean; isVideo?: boolean },
): CaptureEventType {
  if (type === 'screen_record' || type === 'screen_recording') {
    return 'screen_record_start';
  }
  if (options?.isDisappearingMedia) {
    return options.isVideo ? 'screenshot_disappearing_video' : 'screenshot_disappearing_photo';
  }
  return 'screenshot_chat';
}

export { useCaptureDetection, useScreenCapture };
