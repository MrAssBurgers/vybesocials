import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYERS } from '@/lib/vybemap/types';
import { MapSettingsSheet } from './MapSettingsSheet';

afterEach(cleanup);
const props = { mapMode: '3d' as const, layers: DEFAULT_LAYERS, sharing: false, hasMapbox: false, onMapMode: vi.fn(), onToggleLayer: vi.fn(), onGhost: vi.fn(), onSquads: vi.fn(), onDropSpot: vi.fn(), onPlanMeetup: vi.fn(), onClose: vi.fn() };

describe('map renderer recovery in settings', () => {
  it('offers a deliberate return from the flat fallback and closes settings only after selection', () => {
    const restore = vi.fn(), close = vi.fn();
    render(<MapSettingsSheet {...props} onReturnTo3D={restore} onClose={close} />);
    expect(screen.getByText('Flat map active')).toBeVisible();
    expect(restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Return to 3D world map' }));
    expect(restore).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    expect(restore.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
  });

  it('keeps existing alternate modes selectable without showing fallback recovery', () => {
    const select = vi.fn(), restore = vi.fn();
    render(<MapSettingsSheet {...props} hasMapbox mapMode="satellite" onMapMode={select} onReturnTo3D={restore} />);
    expect(screen.queryByRole('button', { name: 'Return to 3D world map' })).toBeNull();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Terrain/ }));
    expect(select).toHaveBeenCalledWith('terrain'); expect(restore).not.toHaveBeenCalled();
  });
});
