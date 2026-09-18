import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveTeleportQuery } from './geocode';

describe('resolveTeleportQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns Mapbox hit when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ place_name: 'Austin, Texas, United States', center: [-97.74, 30.27] }],
        }),
      }),
    );
    const hit = await resolveTeleportQuery('Austin');
    expect(hit).toEqual({ lat: 30.27, lng: -97.74, label: 'Austin' });
  });

  it('returns null for empty query', async () => {
    expect(await resolveTeleportQuery('   ')).toBeNull();
  });
});
