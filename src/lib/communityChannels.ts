export function isVoiceChannel(channel: { type?: string; room_type?: string }) {
  return channel.type === 'voice' || channel.room_type === 'live';
}

export function isTextChannel(channel: { type?: string; room_type?: string }) {
  return !isVoiceChannel(channel) && channel.type !== 'announcement';
}

export function isAnnouncementChannel(channel: { type?: string; room_type?: string }) {
  return channel.type === 'announcement' || channel.room_type === 'announcements';
}
