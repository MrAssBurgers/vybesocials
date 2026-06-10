import type { Room } from '@/hooks/useCommunities';
import type { Channel } from '@/hooks/useServers';

type AnyChannel = Partial<Room> & Partial<Channel> & Record<string, unknown>;

export function isVoiceChannel(channel: AnyChannel) {
  return (channel as any).type === 'voice' || (channel as any).room_type === 'live';
}

export function isTextChannel(channel: AnyChannel) {
  return !isVoiceChannel(channel) && (channel as any).type !== 'announcement';
}

export function isAnnouncementChannel(channel: AnyChannel) {
  return (channel as any).type === 'announcement' || (channel as any).room_type === 'announcements';
}
