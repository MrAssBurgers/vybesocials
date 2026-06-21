import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { UserActivityState } from '@/lib/usersPresenceDoc';

export function uiActivityFromState(state: UserActivityState): ActivityType {
  switch (state) {
    case 'typing':
      return 'typing';
    case 'recording_voice':
      return 'recording_voice';
    case 'recording_video':
      return 'recording_video';
    case 'taking_photo':
    case 'sending_vybe':
      return 'taking_photo';
    case 'uploading_image':
      return 'uploading_image';
    case 'uploading_video':
      return 'uploading_video';
    case 'in_call':
      return 'in_call';
    case 'viewing':
    case 'online':
      return 'viewing';
    default:
      return 'idle';
  }
}

/** Sidebar / list preview line for live peer activity. */
export function activityPreviewLabel(activity: ActivityType): string | null {
  switch (activity) {
    case 'typing':
      return 'typing…';
    case 'viewing':
      return 'In chat';
    case 'taking_photo':
      return 'In Snap…';
    case 'sending_vybe':
      return 'Sending Snap…';
    case 'recording_video':
      return 'Recording…';
    case 'recording_voice':
      return 'Recording voice…';
    case 'uploading_image':
      return 'Sending photo…';
    case 'uploading_video':
      return 'Sending video…';
    case 'in_call':
      return 'In a call';
    default:
      return null;
  }
}
