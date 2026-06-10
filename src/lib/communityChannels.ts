import type { Room } from '@/hooks/useCommunities';
import type { Channel } from '@/hooks/useServers';

export function isVoiceChannel(channel: Pick<Room | Channel, 'type' | 'room_type'>) {
  return channel.type === 'voice' || channel.room_type === 'live';
}

export function isTextChannel(channel: Pick<Room | Channel, 'type' | 'room_type'>) {
  return !isVoiceChannel(channel) && channel.type !== 'announcement';
}

export function isAnnouncementChannel(channel: Pick<Room | Channel, 'type' | 'room_type'>) {
  return channel.type === 'announcement' || channel.room_type === 'announcements';
}
