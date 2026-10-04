import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ failed: false, refetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, profile: { id: 'alice-profile' } }) }));
vi.mock('@/hooks/useServers', () => ({
 useChannelMessages: () => ({ data: [{ id: 'private-message', content: 'Private history', sender_id: 'bob', created_at: '2026-10-01T12:00:00Z', attachment_id: 'asset', media_url: null, media_type: 'image' }], isError: state.failed, isLoading: false, refetch: state.refetch }),
 useSendChannelMessage: () => ({ mutateAsync: vi.fn(), isPending: false }), useMyServerRole: () => ({ data: 'member' }),
}));
vi.mock('@/hooks/useChannelPermissions', () => ({ useMyChannelPermissions: () => ({ data: { can_send: true } }) }));
vi.mock('./useCommunityMessageActions', () => ({ useCommunityMessageActions: () => ({ dialog: null }) }));
vi.mock('./PrivateCommunityAttachment', () => ({ PrivateCommunityAttachment: () => <img src="blob:private-fixture" alt="private attachment" /> }));
vi.mock('./CommunityAttachmentComposer', () => ({ CommunityAttachmentComposer: () => null }));
vi.mock('@/components/chat/EmojiPicker', () => ({ EmojiPicker: () => null }));
import { ChannelChat } from './ChannelChat';
import { RoomChat } from './RoomChat';
afterEach(cleanup);
beforeEach(() => { state.failed = false; state.refetch.mockClear(); Element.prototype.scrollIntoView = vi.fn(); });
describe('both community chat views clear revoked content', () => {
 it.each(['channel', 'room'])('%s removes text, media and sending controls after access fails', variant => {
  const view = variant === 'channel' ? <ChannelChat serverId="server" channelId="private" channelName="Private" /> : <RoomChat communityId="server" roomId="private" roomName="Private" roomType="chat" />;
  const { rerender } = render(view);
  expect(screen.getByText('Private history')).toBeVisible(); expect(screen.getByAltText('private attachment')).toBeInTheDocument();
  state.failed = true;
  rerender(variant === 'channel' ? <ChannelChat serverId="server" channelId="private" channelName="Private updated" /> : <RoomChat communityId="server" roomId="private" roomName="Private updated" roomType="chat" />);
  expect(screen.queryByText('Private history')).toBeNull(); expect(screen.queryByAltText('private attachment')).toBeNull(); expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Check access again' })); expect(state.refetch).toHaveBeenCalledTimes(1);
 });
});
