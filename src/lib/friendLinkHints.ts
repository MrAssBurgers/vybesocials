const ACTIVATE_HINT_KEY = 'vybe_friendlink_activate_hint_seen';
const CREATE_CAMERA_HINT_KEY = 'vybe_create_camera_ui_v2_seen';

export function hasSeenFriendLinkActivateHint(): boolean {
  try {
    return localStorage.getItem(ACTIVATE_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

export function markFriendLinkActivateHintSeen(): void {
  try {
    localStorage.setItem(ACTIVATE_HINT_KEY, '1');
  } catch { /* ignore */ }
}

export function hasSeenCreateCameraCoach(): boolean {
  try {
    return localStorage.getItem(CREATE_CAMERA_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

export function markCreateCameraCoachSeen(): void {
  try {
    localStorage.setItem(CREATE_CAMERA_HINT_KEY, '1');
  } catch { /* ignore */ }
}
