import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ConnectStorefront from './ConnectStorefront';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke } } }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/PageTransition', () => ({ PageTransition: ({ children }: { children: ReactNode }) => <>{children}</> }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('public storefront contract boundary', () => {
  it.each(['acct_seller', 'malformed-account'])('never substitutes the signed-in owner catalog or checkout for %s', accountId => {
    render(<MemoryRouter initialEntries={[`/connect/storefront/${accountId}`]}><Routes><Route path="/connect/storefront/:accountId" element={<ConnectStorefront />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Storefront unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buy' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Marketplace' })).toHaveAttribute('href', '/market');
    expect(invoke).not.toHaveBeenCalled();
  });
});
