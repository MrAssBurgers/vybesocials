import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Developers from './Developers';

vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard); else Reflect.deleteProperty(navigator, 'clipboard'); });
const mount = () => render(<MemoryRouter><Developers /></MemoryRouter>);
const selectDotnet = () => fireEvent.keyDown(screen.getByRole('tab', { name: 'C# / .NET 8' }), { key: 'Enter' });

describe('developer integration examples', () => {
  it('offers the native SDK guide and copies the selected C# example', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    mount(); selectDotnet();
    expect(screen.getByLabelText('C# capture SDK example')).toHaveTextContent('StageCaptureAsync');
    expect(screen.getByRole('link', { name: '.NET integration guide' })).toHaveAttribute('href', expect.stringContaining('/sdk/dotnet/README.md'));
    expect(screen.getByRole('link', { name: 'Universal SDK & example host' })).toHaveAttribute('href', expect.stringContaining('/docs/UNIVERSAL_SDK.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy SDK example' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(expect.stringContaining('using Vybe.Integration;')));
    expect(copy.mock.calls[0][0]).not.toContain('VybePartnerClient');
  });
  it('does not mark a newly selected example copied when an older copy finishes', async () => {
    let finish: () => void = () => {};
    const copy = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Copy SDK example' }));
    selectDotnet();
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Copy SDK example' })).toHaveTextContent('Copy');
    expect(screen.getByRole('button', { name: 'Copy SDK example' })).not.toHaveTextContent('Copied');
  });
});
