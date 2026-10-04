import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationSoundSection } from './NotificationSoundSection';
import { writeDevicePreference } from '@/lib/devicePreferences';
import { VYBE_SOUNDS } from '@/lib/vybeSoundAssets';

const mock = vi.hoisted(() => ({
  settings: { master: true, messages: true, calls: true, ui: false, volume: 72 },
  custom: {} as Record<string, string>, play: vi.fn(), stop: vi.fn(),
}));
vi.mock('@/lib/premiumSounds', () => ({ getSoundSettings: () => ({ ...mock.settings }),
  getCustomSounds: () => mock.custom, updateSoundSettings: (value: object) => Object.assign(mock.settings, value) }));
vi.mock('@/hooks/useCustomSounds', () => ({ useSyncCustomSounds: vi.fn() }));
vi.mock('@/hooks/useSoundPreview', () => ({ useSoundPreview: () => ({ state: 'idle', error: null, play: mock.play, stop: mock.stop }) }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn() } }));
vi.mock('./CustomRingtoneUploader', () => ({ CustomRingtoneUploader: () => null }));
vi.mock('@/components/ui/slider', () => ({ Slider: ({ onValueCommit, ...props }: { onValueCommit: () => void; 'aria-label': string }) => <button aria-label={props['aria-label']} onClick={onValueCommit}>Commit volume</button> }));
beforeEach(() => {
  vi.clearAllMocks(); mock.custom = {};
  Object.assign(mock.settings, { master: true, messages: true, calls: true, ui: false, volume: 72 });
});
afterEach(cleanup);

it('plays the selected message and ringtone choices, with no autoplay on mount', () => {
  mock.custom = { message_tone: '/my-chime.wav', call_ringtone: '/my-ring.wav' };
  render(<NotificationSoundSection />); expect(mock.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Preview message sound' }));
  expect(mock.play).toHaveBeenLastCalledWith('/my-chime.wav', 'messages');
  fireEvent.click(screen.getByRole('button', { name: 'Preview call ringtone' }));
  expect(mock.play).toHaveBeenLastCalledWith('/my-ring.wav', 'calls');
});
it('volume feedback uses an enabled category even while interface sounds are off', () => {
  render(<NotificationSoundSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Sound effects volume' }));
  expect(mock.play).toHaveBeenLastCalledWith(VYBE_SOUNDS.dmReceived, 'messages');
  expect(screen.getByRole('button', { name: 'Preview interface sound' })).toBeDisabled();
});
it('reflects cross-tab zero-volume and master mute without active preview buttons', () => {
  render(<NotificationSoundSection />);
  act(() => { mock.settings.volume = 0; writeDevicePreference('vybe-sound-settings', '{}'); });
  expect(screen.getByRole('button', { name: 'Preview message sound' })).toBeDisabled();
  expect(screen.getByText('Volume is muted. Raise it to hear a preview.')).toBeInTheDocument();
  act(() => { mock.settings.master = false; writeDevicePreference('vybe-sound-settings', '{}'); });
  expect(screen.queryByRole('button', { name: 'Preview message sound' })).toBeNull();
  expect(mock.play).not.toHaveBeenCalled();
});
