import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomRingtoneUploader } from './CustomRingtoneUploader';
import { writeDevicePreference } from '@/lib/devicePreferences';

const mock = vi.hoisted(() => ({
  session: { uid: 'alice', epoch: 1 }, settings: { master: true, messages: true, calls: true, ui: false, volume: 72 },
  validate: vi.fn(), play: vi.fn(), stop: vi.fn(), upload: vi.fn(), remove: vi.fn(), revoke: vi.fn(),
  sounds: [{ sound_type: 'message_tone', file_url: '/saved.wav', file_name: 'Saved chime', duration_seconds: 3 }],
}));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/hooks/useSoundPreview', () => ({ useSoundPreview: () => ({ state: 'idle', error: null, play: mock.play, stop: mock.stop }) }));
vi.mock('@/hooks/useCustomSounds', () => ({
  useCustomSounds: () => ({ data: mock.sounds }), validateAudioFile: mock.validate,
  useUploadCustomSound: () => ({ mutateAsync: mock.upload, isPending: false }),
  useDeleteCustomSound: () => ({ mutateAsync: mock.remove, isPending: false }),
}));
vi.mock('@/lib/premiumSounds', () => ({ getSoundSettings: () => ({ ...mock.settings }) }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn() } }));
const renderUploader = () => render(<CustomRingtoneUploader soundType="message_tone" title="Message Tone" description="Your message sound" maxDuration={5} />);
beforeEach(() => {
  vi.clearAllMocks(); mock.settings.master = true;
  vi.stubGlobal('URL', class extends URL { static createObjectURL = (file: File) => `blob:${file.name}`; static revokeObjectURL = mock.revoke; });
  mock.validate.mockResolvedValue({ valid: true, duration: 2 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('routes uploaded previews through the shared mix and honors mute', () => {
  const view = renderUploader();
  expect(view.container.querySelector('audio')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Preview Message Tone' }));
  expect(mock.play).toHaveBeenCalledWith('/saved.wav', 'messages');
  act(() => { mock.settings.master = false; writeDevicePreference('vybe-sound-settings', '{}'); });
  expect(screen.getByRole('button', { name: 'Preview Message Tone' })).toBeDisabled();
});
it('releases selected file previews on replacement, cancel and account reset', async () => {
  const view = renderUploader();
  const input = () => view.container.querySelector('input[type=file]')!;
  const select = async (name: string) => {
    fireEvent.change(input(), { target: { files: [new File(['sound'], name, { type: 'audio/wav' })] } });
    await screen.findByText(name);
  };
  await select('one.wav'); await select('two.wav');
  expect(mock.revoke).toHaveBeenCalledWith('blob:one.wav');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel selected sound' }));
  expect(mock.revoke).toHaveBeenCalledWith('blob:two.wav');
  await select('three.wav');
  mock.session = { uid: 'bob', epoch: 2 };
  view.rerender(<CustomRingtoneUploader soundType="message_tone" title="Message Tone" description="Your message sound" maxDuration={5} />);
  expect(mock.revoke).toHaveBeenCalledWith('blob:three.wav');
  expect(screen.queryByText('three.wav')).toBeNull();
});
it('ignores a slower validation for an earlier file selection', async () => {
  let finish!: (value: unknown) => void;
  mock.validate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const view = renderUploader(); const input = view.container.querySelector('input[type=file]')!;
  fireEvent.change(input, { target: { files: [new File(['old'], 'old.wav')] } });
  fireEvent.change(input, { target: { files: [new File(['new'], 'new.wav')] } });
  await screen.findByText('new.wav');
  await act(async () => finish({ valid: true, duration: 1 }));
  expect(screen.queryByText('old.wav')).toBeNull(); expect(screen.getByText('new.wav')).toBeInTheDocument();
});
