import { db } from '@/lib/firebase';

export async function sendMapWave(
  fromProfileId: string,
  toProfileId: string,
  fromName: string,
): Promise<void> {
  await db.from('notifications').insert({
    user_id: toProfileId,
    actor_id: fromProfileId,
    type: 'map_wave',
    title: fromName,
    body: 'waved at you on VybeMap 👋',
    deep_link: '/map',
    read: false,
  });
}
