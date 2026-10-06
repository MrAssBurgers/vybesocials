import { Suspense, useMemo } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMapRenderers } from './createMapRenderers';
import { MapErrorBoundary } from './MapErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('map renderer loading and retry', () => {
  it('downloads no renderer until a map actually renders', () => {
    const mapbox = vi.fn(), flat = vi.fn();
    createMapRenderers(mapbox, flat);
    expect(mapbox).not.toHaveBeenCalled(); expect(flat).not.toHaveBeenCalled();
  });
  it('retries a failed 3D load with fresh lazy state without choosing the flat map', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mapbox = vi.fn().mockRejectedValueOnce(new Error('Temporary renderer initialization failed'))
      .mockResolvedValue({ default: () => <p>3D world ready</p> });
    const flat = vi.fn();
    function Map() {
      const { VybeMapboxCanvas: Canvas } = useMemo(() => createMapRenderers(mapbox, flat), []);
      return <Suspense fallback={<p>Loading world</p>}><Canvas {...{} as never} /></Suspense>;
    }
    render(<MapErrorBoundary><Map /></MapErrorBoundary>);
    await screen.findByText("VybeMap couldn't load");
    expect(mapbox).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('3D world ready');
    expect(mapbox).toHaveBeenCalledTimes(2); expect(flat).not.toHaveBeenCalled();
  });
  it('keeps the same renderer through ordinary map updates', async () => {
    const mapbox = vi.fn().mockResolvedValue({ default: () => <p>3D world ready</p> }), flat = vi.fn();
    function Map({ label }: { label: string }) {
      const { VybeMapboxCanvas: Canvas } = useMemo(() => createMapRenderers(mapbox, flat), []);
      return <><p>{label}</p><Suspense fallback={null}><Canvas {...{} as never} /></Suspense></>;
    }
    const view = render(<Map label="First position" />); await screen.findByText('3D world ready');
    view.rerender(<Map label="Updated position" />);
    expect(screen.getByText('3D world ready')).toBeInTheDocument(); expect(mapbox).toHaveBeenCalledOnce();
  });
  it('requests a document reload for a browser-cached failed module fetch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mapbox = vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    const reload = vi.fn();
    function Map() {
      const { VybeMapboxCanvas: Canvas } = useMemo(() => createMapRenderers(mapbox), []);
      return <Suspense fallback={null}><Canvas {...{} as never} /></Suspense>;
    }
    render(<MapErrorBoundary onReload={reload}><Map /></MapErrorBoundary>);
    await screen.findByText("VybeMap couldn't load");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledOnce(); expect(mapbox).toHaveBeenCalledOnce();
  });
});
