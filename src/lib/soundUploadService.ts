import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase/app';
import { getFirebaseConfig } from '@/lib/firebase/config';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { isLocalPreview, LOCAL_PREVIEW_PROJECT } from '@/lib/firebase/localPreview';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';
import type { Sound } from '@/hooks/useSounds';

export interface SoundActor { uid: string; profileId: string; guard: () => void }
export interface SoundUploadReceipt { success: true; ownerUid: string; profileId: string; uploadId: string; status: 'uploading' | 'checking' | 'published' | 'cancelled' | 'expired'; sourcePath: string; expiresAt: number; soundId: string | null }
export interface SoundUploadInput { file: File; title: string; tags?: string[]; publicConsent: boolean }
export function captureSoundActor(uid: string, profileId: string, viewGuard?: () => void): SoundActor {
  const account = reportAccountGuard(uid), session = reportAccountSnapshot();
  const guard = () => { account(); viewGuard?.(); if (!uid || !profileId || session.uid !== uid) throw new Error('Wait for your account to load.'); };
  guard(); return { uid, profileId, guard };
}
const isRow = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function soundContentType(file: File) {
  const aliases: Record<string, string> = { 'audio/mp3': 'audio/mpeg', 'audio/x-wav': 'audio/wav', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4' };
  const type = aliases[file.type] || file.type;
  if (['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'].includes(type)) return type;
  if (!type) return ({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() || ''] || '';
  return '';
}
export async function soundUploadRequest(actor: SoundActor, input: Record<string, unknown>): Promise<SoundUploadReceipt> {
  actor.guard(); const { data, error } = await invokeFunction<unknown>('upload-sound', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId }); actor.guard();
  if (error) throw new Error(error.message || 'Sound upload could not be confirmed. Retry with the same file.');
  if (!isRow(data) || data.success !== true || data.ownerUid !== actor.uid || data.profileId !== actor.profileId || !validId(data.uploadId)
    || !['uploading', 'checking', 'published', 'cancelled', 'expired'].includes(String(data.status)) || !Number.isFinite(data.expiresAt)
    || data.sourcePath !== `sound-uploads/${actor.uid}/${data.uploadId}/source` || (data.status === 'published' ? data.soundId !== data.uploadId : data.soundId !== null)) throw new Error('Sound upload receipt could not be verified. Check your library before retrying.');
  if (input.uploadId && data.uploadId !== input.uploadId) throw new Error('The sound upload receipt changed. Reopen sounds.');
  return data as unknown as SoundUploadReceipt;
}
const attempts = new Map<string, string>();
const reservedAttempts = new Map<string, string>();
export function forgetCancelledSoundAttempt(uploadId: string) { const key = reservedAttempts.get(uploadId); if (key) finishAttempt(key); reservedAttempts.delete(uploadId); }
function requestId(key: string) {
  let id = attempts.get(key);
  try { id ||= sessionStorage.getItem(key) || undefined; } catch { /* In-memory retry remains available. */ }
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) id = crypto.randomUUID();
  attempts.set(key, id);
  try { sessionStorage.setItem(key, id); const keys = Object.keys(sessionStorage).filter(value => value.startsWith('vybe.sound-upload.')); for (const stale of keys.slice(0, Math.max(0, keys.length - 25))) if (stale !== key) sessionStorage.removeItem(stale); } catch { /* Browser storage is optional. */ }
  return id;
}
function finishAttempt(key: string) { attempts.delete(key); try { sessionStorage.removeItem(key); } catch { /* Optional storage. */ } }
const cancelled = () => new DOMException('Upload stopped. Check your sounds if publication was already finishing.', 'AbortError');
export async function publishOriginalSound(input: SoundUploadInput, actor: SoundActor, signal: AbortSignal, progress: (value: number, stage: string) => void, reserved: (receipt: SoundUploadReceipt) => void) {
  const guard = () => { actor.guard(); if (signal.aborted) throw cancelled(); };
  guard(); const contentType = soundContentType(input.file), title = input.title.trim(), tags = [...new Set((input.tags || []).map(tag => tag.trim()).filter(Boolean))];
  if (!contentType || input.file.size < 16 || input.file.size > 20 * 1024 * 1024 || !title || title.length > 100 || tags.length > 10 || tags.some(tag => tag.length > 30) || !input.publicConsent) throw new Error('Choose audio up to 20 MiB, a title and up to 10 tags, then confirm public sharing.');
  progress(0, 'Preparing your audio');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await input.file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join(''); guard();
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.profileId, sha256, title, tags, contentType]))))].map(byte => byte.toString(16).padStart(2, '0')).join(''); guard();
  const key = `vybe.sound-upload.${actor.uid}.${fingerprint}`;
  const attemptId = requestId(key);
  let receipt: SoundUploadReceipt;
  try { receipt = await soundUploadRequest(actor, { action: 'reserve', requestId: attemptId, title, tags, byteSize: input.file.size, contentType, sha256, publicConsent: true }); }
  catch (failure) {
    guard();
    const uploadId = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.uid, attemptId]))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    try { const prior = await soundUploadRequest(actor, { action: 'status', uploadId }); guard(); if (prior.status === 'cancelled' || prior.status === 'expired') finishAttempt(key); } catch { guard(); /* Unknown or removed publication: retain its identity. */ }
    throw failure;
  }
  guard(); reserved(receipt);
  reservedAttempts.set(receipt.uploadId, key);
  if (receipt.status === 'cancelled' || receipt.status === 'expired') { finishAttempt(key); reservedAttempts.delete(receipt.uploadId); throw new Error(`This upload ${receipt.status === 'expired' ? 'expired' : 'was cancelled'}. Press Publish sound again to start a new upload with your selected file.`); }
  if (receipt.status === 'uploading') {
    progress(0, 'Uploading audio bytes');
    try {
      await new Promise<void>((resolve, reject) => {
        guard(); const task = uploadBytesResumable(ref(getStorage(getFirebaseApp()), receipt.sourcePath), input.file, { contentType });
        const abort = () => { task.cancel(); reject(cancelled()); };
        signal.addEventListener('abort', abort, { once: true });
        task.on('state_changed', snapshot => { try { guard(); progress(Math.round(snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes) * 90), 'Uploading audio bytes'); } catch (error) { task.cancel(); reject(error); } }, error => { signal.removeEventListener('abort', abort); reject(error); }, () => { signal.removeEventListener('abort', abort); resolve(); });
      });
    } catch (error) {
      guard();
      // An immutable upload may have completed before its acknowledgement was
      // lost. Only the server's generation/hash inspection can confirm that.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
    }
  }
  progress(90, 'Checking audio and confirming publication');
  for (let count = 0; receipt.status !== 'published' && count < 45; count++) {
    guard(); receipt = await soundUploadRequest(actor, { action: 'finalize', uploadId: receipt.uploadId }); guard();
    if (receipt.status !== 'published') await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(cancelled()); }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000); signal.addEventListener('abort', abort, { once: true }); });
  }
  guard(); if (receipt.status !== 'published') throw new Error('Audio checking is still finishing. Retry with the same file to recover its result.');
  finishAttempt(key); reservedAttempts.delete(receipt.uploadId); progress(100, 'Sound published'); return receipt;
}

function audioUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid sound audio.');
  const url = new URL(value), bucket = getFirebaseConfig().storageBucket;
  if (url.pathname.split('/')[3] !== bucket || !url.pathname.startsWith(`/v0/b/${bucket}/o/`) || !decodeURIComponent(url.pathname.split('/o/')[1] || '').startsWith('original-sounds/') || url.searchParams.get('alt') !== 'media' || !url.searchParams.get('token')) throw new Error('Invalid sound audio.');
  if (isLocalPreview()) {
    if (bucket !== `${LOCAL_PREVIEW_PROJECT}.appspot.com` || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '9399' || url.protocol !== 'http:') throw new Error('Invalid preview audio.');
    return `${location.origin}${url.pathname}${url.search}`;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || url.username || url.password || url.port) throw new Error('Invalid sound audio.');
  return url.href;
}
export function parseLibrarySound(value: unknown, expectedId?: string): Sound {
    if (!isRow(value) || !validId(value.sound_id) || (expectedId && value.sound_id !== expectedId) || typeof value.title !== 'string' || value.title.length > 100 || typeof value.artist !== 'string' || value.artist.length > 150
      || (value.is_saved !== undefined && typeof value.is_saved !== 'boolean') || typeof value.duration !== 'number' || value.duration < 0.1 || value.duration > 60 || !Array.isArray(value.tags) || value.tags.length > 10 || value.tags.some(tag => typeof tag !== 'string' || tag.length > 30)
      || typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at)) || !['not_reviewed', 'approved'].includes(String(value.moderation_status))) throw new Error('Sound results could not be verified.');
    return { ...value, audio_url: audioUrl(value.audio_url), preview_url: audioUrl(value.preview_url) } as unknown as Sound;
}
export async function readSoundLibrary(actor: SoundActor, input: { action: 'list'; kind: 'new' | 'trending' | 'mine'; cursor?: string } | { action: 'get'; soundId: string }) {
  actor.guard(); const { data, error } = await invokeFunction<unknown>('read-sound-library', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId }); actor.guard();
  if (error) throw new Error('Your sound library could not be loaded. Please retry.');
  if (!isRow(data) || data.success !== true || data.ownerUid !== actor.uid || data.profileId !== actor.profileId || !Array.isArray(data.sounds) || data.sounds.length > (input.action === 'get' ? 1 : 25)
    || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && /^[a-f0-9]{32}$/.test(data.nextCursor) && (input.action !== 'list' || data.nextCursor !== input.cursor)))) throw new Error('Sound results could not be verified.');
  const sounds = data.sounds.map(value => parseLibrarySound(value, input.action === 'get' ? input.soundId : undefined));
  if (new Set(sounds.map(sound => sound.sound_id)).size !== sounds.length) throw new Error('Repeated sound results. Please refresh.');
  return { sounds, nextCursor: data.nextCursor as string | null };
}
