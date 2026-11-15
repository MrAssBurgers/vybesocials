import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn(), write: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentFromServer: state.read, updateDocument: state.write }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: { getUser: async () => ({ data: { user: { id: state.uid } } }) } }));
vi.mock('@/lib/dmAccountScope', () => ({ isOwnedDmActor: (profile: string, uid: string) => profile === `profile-${uid}` }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.uid || epoch !== state.epoch) throw Error('Retired account'); }; } }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => { const q: any = { select: () => q, update: () => q, eq: () => q, then: (resolve: any, reject: any) => state.query().then(resolve, reject) }; return q; } } }));
import { markConversationReadForViewer } from './markConversationRead';
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.read.mockReset().mockResolvedValue({ conversation_id: 'chat', user_id: 'profile-alice' }); state.write.mockReset().mockResolvedValue(undefined); state.query.mockReset().mockResolvedValue({ data: [], error: null }); });
it('acknowledges the existing owned tuple without speculative duplicate writes', async () => {
  await markConversationReadForViewer('chat', 'profile-alice', 'alice');
  expect(state.write).toHaveBeenCalledOnce(); expect(state.write.mock.calls[0].slice(0, 2)).toEqual(['conversation_members', 'chat_profile-alice']); expect(state.query).not.toHaveBeenCalled();
});
it('never reports success when Firebase rejects every attempted write', async () => {
  state.write.mockRejectedValue(new Error('Denied')); await expect(markConversationReadForViewer('chat', 'profile-alice', 'alice')).rejects.toThrow('Denied');
});
it('does not create a guessed membership when no confirmed tuple exists', async () => {
  state.read.mockResolvedValue(null); await expect(markConversationReadForViewer('chat', 'profile-alice', 'alice')).rejects.toThrow('membership'); expect(state.write).not.toHaveBeenCalled();
});
it('rejects a foreign tuple and accepts an existing legacy row only after validating it', async () => {
  state.read.mockImplementation((_table, id) => Promise.resolve({ conversation_id: id === 'legacy' ? 'chat' : 'another', user_id: 'profile-alice' }));
  state.query.mockResolvedValueOnce({ data: [{ id: 'foreign', conversation_id: 'chat', user_id: 'bob' }, { id: 'legacy', conversation_id: 'chat', user_id: 'profile-alice' }], error: null });
  await markConversationReadForViewer('chat', 'profile-alice', 'alice'); expect(state.write).toHaveBeenCalledOnce(); expect(state.write.mock.calls[0][1]).toBe('legacy');
});
it('retires a pending lookup before dispatch when the account leaves and returns', async () => {
  let finish!: (value: unknown) => void; state.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = markConversationReadForViewer('chat', 'profile-alice', 'alice').catch(error => error); expect(state.read).toHaveBeenCalledOnce(); state.epoch = 3;
  finish({ conversation_id: 'chat', user_id: 'profile-alice' }); expect(await pending).toBeInstanceOf(Error); expect(state.write).not.toHaveBeenCalled(); expect(state.query).not.toHaveBeenCalled();
});

it('checks the physical legacy target rather than trusting a returned id field', async () => {
  state.read.mockResolvedValue({ conversation_id: 'different-chat', user_id: 'profile-alice' });
  state.query.mockResolvedValue({ data: [{ id: 'different-physical-row', conversation_id: 'chat', user_id: 'profile-alice' }], error: null });
  await expect(markConversationReadForViewer('chat', 'profile-alice', 'alice')).rejects.toThrow('membership');
  expect(state.write).not.toHaveBeenCalled();
});
