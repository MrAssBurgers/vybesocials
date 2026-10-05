import { invokeFunction } from '@/lib/firebase/functionsService';
import { parseLibrarySound, type SoundActor } from '@/lib/soundUploadService';
import type { Sound } from '@/hooks/useSounds';
export interface SavedSoundEntry { referenceId: string; soundId: string | null; legacy: boolean; sound: Sound | null }
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const soundId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const referenceId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
async function request(actor: SoundActor, input: Record<string, unknown>) {
  actor.guard(); const { data, error } = await invokeFunction<unknown>('manage-saved-sounds', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId }); actor.guard();
  if (error) throw new Error(error.message || 'Saved sounds could not be updated. Retry.');
  if (!row(data) || data.success !== true || data.ownerUid !== actor.uid || data.profileId !== actor.profileId) throw new Error('Saved sound receipt could not be verified. Retry.');
  return data;
}
export async function listSavedSounds(actor: SoundActor, cursor?: string) {
  const data = await request(actor, { action: 'list', ...(cursor ? { cursor } : {}) });
  if (!Array.isArray(data.entries) || data.entries.length > 25 || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && /^[a-f0-9]{32}$/.test(data.nextCursor) && data.nextCursor !== cursor))) throw new Error('Saved sound page could not be verified. Refresh.');
  const entries: SavedSoundEntry[] = data.entries.map(value => {
    if (!row(value) || !referenceId(value.referenceId) || typeof value.legacy !== 'boolean' || (value.legacy ? value.soundId !== null || value.sound !== null : !soundId(value.soundId))) throw new Error('Saved sound reference could not be verified.');
    return { referenceId: value.referenceId, soundId: value.soundId as string | null, legacy: value.legacy, sound: value.sound === null ? null : parseLibrarySound(value.sound, value.soundId as string) };
  });
  if (new Set(entries.map(entry => `${entry.legacy}:${entry.referenceId}`)).size !== entries.length) throw new Error('Repeated saved references. Refresh.');
  return { entries, nextCursor: data.nextCursor as string | null };
}
export async function getSoundSaved(actor: SoundActor, id: string) {
  const data = await request(actor, { action: 'status', soundId: id });
  if (data.soundId !== id || typeof data.saved !== 'boolean') throw new Error('Saved status could not be verified.');
  return data.saved;
}
const attempts = new Map<string, string>();
function attempt(key: string) {
  let id = attempts.get(key); try { id ||= sessionStorage.getItem(key) || undefined; } catch { /* Same-view retry remains available. */ }
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) id = crypto.randomUUID(); attempts.set(key, id);
  if (attempts.size > 64) attempts.delete(attempts.keys().next().value!);
  try { sessionStorage.setItem(key, id); const keys = Object.keys(sessionStorage).filter(value => value.startsWith('vybe.saved-sound.')); for (const stale of keys.slice(0, Math.max(0, keys.length - 64))) if (stale !== key) sessionStorage.removeItem(stale); } catch { /* Browser persistence is optional. */ }
  return id;
}
export async function updateSavedSound(actor: SoundActor, input: { action: 'set'; soundId: string; saved: boolean } | { action: 'removeLegacy'; referenceId: string }) {
  actor.guard(); const key = `vybe.saved-sound.${JSON.stringify([actor.uid, actor.profileId, input])}`;
  const data = await request(actor, { ...input, requestId: attempt(key) });
  if (input.action === 'set' ? data.soundId !== input.soundId || typeof data.saved !== 'boolean' : data.referenceId !== input.referenceId || typeof data.removed !== 'boolean') throw new Error('Saved sound update could not be verified. Retry.');
  attempts.delete(key); try { sessionStorage.removeItem(key); } catch { /* Optional persistence. */ }
  if (input.action === 'removeLegacy' && data.removed !== true) throw new Error('That earlier removal was recorded, but this reference exists again. Press Remove reference again to remove the current reference.');
  return input.action === 'set' ? data.saved as boolean : false;
}
