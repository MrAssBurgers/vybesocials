import type { MapWaveActor, MapWaveTarget } from './mapWaveService';

/** Wave uses server-owned notification content and current map admission. */
export async function sendMapWave(actor: MapWaveActor, target: MapWaveTarget, guard: () => void) {
  guard();
  const { sendCheckedMapWave } = await import('./mapWaveService');
  guard();
  return sendCheckedMapWave(actor, target, guard);
}
