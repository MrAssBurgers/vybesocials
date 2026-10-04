import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendThemeToUser } from './sendShareToUser';
const state = vi.hoisted(() => ({ chat: vi.fn(), repair: vi.fn(), insert: vi.fn(), recency: vi.fn(), bump: vi.fn() }));
vi.mock('@/lib/firebase/chats', () => ({ createDmChat: state.chat }));
vi.mock('@/lib/dmMembershipRepair', () => ({ repairConversationForSend: state.repair }));
vi.mock('@/lib/shareRecency', () => ({ recordShareTo: state.recency }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: state.insert, bumpConversationUpdatedAt: state.bump }));
const input = { recipientProfileId: 'bob', senderProfileId: 'alice', sharedThemeId: 'theme-one', clientMessageId: 'stable-theme-message', accountGuard: () => {} };
beforeEach(() => {
  vi.clearAllMocks(); state.chat.mockResolvedValue('conversation'); state.repair.mockResolvedValue(undefined);
  state.recency.mockImplementation(() => {});
  state.insert.mockImplementation(async payload => ({ data: { ...payload, id: 'message-one' }, error: null }));
});
describe('theme message receipts', () => {
  it('uses the canonical idempotent DM contract and checks the actual message receipt', async () => {
    expect(await sendThemeToUser(input)).toBe(true);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ content: 'theme-one', media_url: null, media_type: null, client_message_id: 'stable-theme-message' }), expect.objectContaining({ otherProfileId: 'bob' }));
    expect(state.bump).not.toHaveBeenCalled();
  });
  it.each([{ content: 'wrong' }, { sender_id: 'other' }, { conversation_id: 'other' }, { client_message_id: 'wrong' }, { message_type: 'text' }])('rejects a mismatched receipt %j', async mismatch => {
    state.insert.mockImplementation(async payload => ({ data: { ...payload, id: 'message', ...mismatch }, error: null }));
    expect(await sendThemeToUser(input)).toBe(false); expect(state.recency).not.toHaveBeenCalled();
  });
  it('does not report a confirmed message as failed when optional recency fails', async () => {
    state.recency.mockImplementation(() => { throw new Error('Storage unavailable'); });
    expect(await sendThemeToUser(input)).toBe(true);
  });
  it('checks the initiating account again after conversation lookup before any send', async () => {
    let changed = false; state.chat.mockImplementation(async () => { changed = true; return 'conversation'; });
    expect(await sendThemeToUser({ ...input, accountGuard: () => { if (changed) throw new Error('Account changed'); } })).toBe(false);
    expect(state.insert).not.toHaveBeenCalled();
  });
});
