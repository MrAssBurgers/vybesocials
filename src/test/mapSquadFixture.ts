import type { MapGroupMap } from '@/lib/vybemap/types';
export const squadFixture = (patch: Partial<MapGroupMap> = {}): MapGroupMap => ({ id: 'squad-one', name: 'Friday crew', emoji: '🗺️', color: '#8b5cf6', owner_id: 'profile-alice', created_at: '2026-10-05T10:00:00Z', revision: 'a'.repeat(48), status: 'active', legacy: false, member_count: 1, membership: { role: 'owner', status: 'active', revision: 'b'.repeat(48) }, ...patch });
export const squadTime = () => ({ serverTime: Date.now(), validUntil: Date.now() + 15_000 });
export function squadDeferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { resolve, reject, promise }; }
