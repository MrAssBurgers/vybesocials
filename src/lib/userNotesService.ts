import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { withTimeout } from '@/lib/withTimeout';

const id = z.string().min(1).max(128).refine(value => !value.includes('/'));
const revision = z.string().regex(/^[a-f0-9]{48,64}$/);
const url = z.string().max(2048).url().refine(value => {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; }
});
export function validNoteGifUrl(value: unknown): value is string {
  if (!url.safeParse(value).success) return false;
  const host = new URL(value as string).hostname;
  return host === 'giphy.com' || host.endsWith('.giphy.com');
}
const note = z.object({ id, user_id: id, content: z.string().max(60), gif_url: z.string().refine(validNoteGifUrl).nullable(),
  created_at: z.string().datetime(), expires_at: z.string().datetime() }).strict();
const friendNote = note.extend({ profile: z.object({ id, username: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/), display_name: z.string().max(200).nullable(), avatar_url: url.nullable() }).strict() }).strict();
const identity = { ownerUid: id, viewerProfileId: id, checkedAt: z.number().int().nonnegative() };
const ownState = z.object({ ...identity, note: note.nullable(), revision: revision.nullable() }).strict();
const friendsPage = z.object({ ...identity, notes: z.array(friendNote).max(20), nextCursor: z.string().min(1).max(1500).refine(value => !value.includes('/')).nullable() }).strict();
const receipt = z.object({ success: z.literal(true), ownerUid: id, viewerProfileId: id, action: z.enum(['save', 'delete']), requestId: id, revision }).strict();
export type UserNote = z.infer<typeof note> & { profile?: z.infer<typeof friendNote>['profile'] };
export type NoteIdentity = { expectedOwnerUid: string; expectedProfileId: string };
export type OwnNoteState = z.infer<typeof ownState> & { leaseUntil: number; receivedAt: number };
export type FriendsNotesPage = z.infer<typeof friendsPage> & { leaseUntil: number; receivedAt: number };
export type NoteChange = { action: 'save'; content: string; gifUrl: string | null } | { action: 'delete' };
const checkSignal = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Note request cancelled', 'AbortError'); };
function matchIdentity(result: { ownerUid?: string; viewerProfileId?: string }, input: NoteIdentity) {
  if (result.ownerUid !== input.expectedOwnerUid || result.viewerProfileId !== input.expectedProfileId) throw new Error('Your notes account could not be verified.');
}
function checkNote(note: UserNote, checkedAt: number) {
  const created = Date.parse(note.created_at), expires = Date.parse(note.expires_at);
  if (created > checkedAt || expires <= checkedAt || expires <= created || expires - created > 86400000
    || (!note.content.trim() && !note.gif_url) || Array.from(note.content).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('This note could not be verified.');
}
export async function readOwnNote(input: NoteIdentity, guard: () => void, signal?: AbortSignal): Promise<OwnNoteState> {
  guard(); checkSignal(signal); const started = Date.now();
  const result = await withTimeout(invokeFunction<unknown>('manageUserNote', { ...input, action: 'read' }), 15000, 'Your note could not load. Please retry.');
  guard(); checkSignal(signal);
  if (result.error) throw new Error(result.error.message || 'Your note could not load.');
  const parsed = ownState.safeParse(result.data);
  if (!parsed.success) throw new Error('Your note response could not be verified.');
  matchIdentity(parsed.data, input);
  if (parsed.data.note) { checkNote(parsed.data.note, parsed.data.checkedAt); if (parsed.data.note.user_id !== input.expectedOwnerUid) throw new Error('Your note owner could not be verified.'); }
  return { ...parsed.data, receivedAt: started, leaseUntil: started + 30000 };
}
export async function readFriendsNotesPage(input: NoteIdentity & { cursor?: string }, guard: () => void, signal?: AbortSignal): Promise<FriendsNotesPage> {
  guard(); checkSignal(signal); const started = Date.now();
  const result = await withTimeout(invokeFunction<unknown>('getFriendsNotes', input), 15000, 'Friends’ notes could not load. Please retry.');
  guard(); checkSignal(signal);
  if (result.error) throw new Error(result.error.message || 'Friends’ notes could not load.');
  const parsed = friendsPage.safeParse(result.data);
  if (!parsed.success) throw new Error('Friends’ notes could not be verified.');
  matchIdentity(parsed.data, input);
  if (input.cursor && parsed.data.nextCursor === input.cursor) throw new Error('The notes page did not advance. Retry the list.');
  if (new Set(parsed.data.notes.map(note => note.user_id)).size !== parsed.data.notes.length) throw new Error('Duplicate notes could not be verified.');
  for (const note of parsed.data.notes) { checkNote(note, parsed.data.checkedAt); if (note.user_id === input.expectedOwnerUid) throw new Error('Friends’ notes could not be verified.'); }
  return { ...parsed.data, receivedAt: started, leaseUntil: started + 30000 };
}
export async function changeOwnNote(input: NoteIdentity & NoteChange & { expectedRevision: string | null; requestId: string }, guard: () => void) {
  guard();
  const result = await invokeFunction<unknown>('manageUserNote', input);
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Your note was not saved. Please retry.'), { code: result.error.code || result.error.name });
  const parsed = receipt.safeParse(result.data);
  if (!parsed.success) throw new Error('Your note change was not confirmed. Please retry.');
  matchIdentity(parsed.data, input);
  if (parsed.data.action !== input.action || parsed.data.requestId !== input.requestId) throw new Error('Your note change was not confirmed. Please retry.');
  return parsed.data;
}
