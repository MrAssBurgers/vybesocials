/** Structured WebRTC / LiveKit lifecycle logging for call debugging. */

export type CallMediaEvent =
  | 'room_create'
  | 'room_connecting'
  | 'room_connected'
  | 'room_disconnected'
  | 'user_joined'
  | 'user_left'
  | 'camera_init'
  | 'local_track_published'
  | 'local_track_unpublished'
  | 'remote_track_published'
  | 'remote_track_subscribed'
  | 'remote_video_attached'
  | 'remote_audio_attached'
  | 'subscribe_rescan'
  | 'participant_connected';

export function logCallMedia(
  event: CallMediaEvent,
  detail?: Record<string, unknown>,
): void {
  const row = { ts: new Date().toISOString(), event, ...detail };
  console.info('[CallMedia]', row);
}
