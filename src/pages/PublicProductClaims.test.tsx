import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VybeHome from './VybeHome';
import Features from './Features';
import FAQ from './FAQ';
import About from './About';
import Safety from './Safety';

const publicData = vi.hoisted(() => ({
  count: null as number | null,
  creators: [] as { id: string; display_name: string; avatar_url: string }[],
}));
vi.mock('@/hooks/usePublicUserCount', () => ({ usePublicUserCount: () => ({ data: publicData.count, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useLandingTopCreators', () => ({ useLandingTopCreators: () => ({ data: publicData.creators }) }));
vi.mock('@/hooks/useAppScreenshots', () => ({ useAppScreenshots: () => ({ shots: [] }) }));
vi.mock('@/hooks/useVybeMarkColors', () => ({ useVybeMarkColors: () => ({ primary: '#8040ff', accent: '#20aaff' }) }));
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const elements = new Map<string, ComponentType<HTMLAttributes<HTMLElement>>>();
  const motionKeys = new Set(['initial', 'animate', 'exit', 'whileInView', 'viewport', 'transition', 'whileHover', 'whileTap']);
  return { motion: new Proxy({}, { get: (_, tag: string) => {
    if (!elements.has(tag)) elements.set(tag, props => createElement(tag, Object.fromEntries(Object.entries(props).filter(([key]) => !motionKeys.has(key)))));
    return elements.get(tag);
  } }) };
});

beforeEach(() => {
  publicData.count = null;
  publicData.creators = [];
  document.head.innerHTML = '<meta name="description" content="VYBE"><link rel="canonical" href="https://vybehub.app/">';
});
afterEach(cleanup);
const mount = (page: ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('public product claims and creator entry points', () => {
  it('does not invent member avatars or a zero count when public data is unavailable', () => {
    const { container } = mount(<VybeHome />);
    expect(screen.queryByLabelText('Featured community members')).not.toBeInTheDocument();
    expect(container.querySelector('img[src*="avatars/"]')).toBeNull();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Joining a small, growing crew')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/24\/7|E2E|End-to-end encrypted DMs|Real creator payouts|Customize every pixel|Instagram|Discord/);
  });

  it('shows only supplied public creator profiles and the actual member count', () => {
    publicData.count = 1;
    publicData.creators = [{ id: 'real-creator', display_name: 'River', avatar_url: 'https://example.test/river.webp' }];
    mount(<VybeHome />);
    const members = within(screen.getByLabelText('Featured community members'));
    expect(members.getAllByRole('img')).toHaveLength(1);
    expect(members.getByRole('img', { name: 'River — VYBE Creator Profile' })).toHaveAttribute('src', publicData.creators[0].avatar_url);
    expect(screen.getByText('1 early member')).toBeInTheDocument();
  });

  it('offers mini-app creation and a clearly qualified game SDK preview from the tour', () => {
    mount(<VybeHome />);
    expect(screen.getByRole('link', { name: 'Open Mini App Studio' })).toHaveAttribute('href', '/mini-apps');
    expect(screen.getByRole('link', { name: 'Explore the Game SDK' })).toHaveAttribute('href', '/developers#game-capture');
    expect(screen.getByText('Sign in to save drafts and publish.')).toBeInTheDocument();
    expect(screen.getByText(/Developer preview\. Requires a reviewed game registration and deployed capture services\./)).toBeInTheDocument();
  });

  it('distinguishes social features and in-app items from unavailable cash earning', () => {
    mount(<Features />);
    expect(screen.getByText(/Cash tips, creator payouts, paid subscriptions, and rewarded ads are not currently available\./)).toBeInTheDocument();
    expect(screen.getByText(/VYBE DMs are not end-to-end encrypted/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game SDK · developer preview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Mini App Studio →' })).toHaveAttribute('href', '/mini-apps');
    expect(screen.getByRole('link', { name: 'Build with VYBE' })).toHaveAttribute('href', '/developers');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('developer preview');
  });

  it('keeps the FAQ visible privacy and earning answers consistent with search metadata', () => {
    mount(<FAQ />);
    const schema = JSON.parse(document.querySelector('script[data-page-meta]')!.textContent!);
    for (const question of ['Is my data private? What about my DMs?', 'Can creators earn cash on VYBE?', 'Can I connect a game to VYBE?']) {
      fireEvent.click(screen.getByRole('button', { name: question }));
      const answer = schema.mainEntity.find((item: { name: string }) => item.name === question).acceptedAnswer.text;
      expect(screen.getByText(answer)).toBeInTheDocument();
    }
    const indexedText = JSON.stringify(schema);
    expect(indexedText).toContain('not end-to-end encrypted');
    expect(indexedText).toContain('Cash tips, creator payouts, and paid subscriptions are not currently available');
    expect(indexedText).toContain('reviewed game registration and deployed capture services');
    expect(indexedText).not.toMatch(/85%|AES-256|plaintext only|within 24 hours|every upload is AI-scanned|Google AdSense/);
  });

  it('describes About creator tools without promising monetization', () => {
    const { container } = mount(<About />);
    expect(screen.getByRole('link', { name: 'Mini App Studio' })).toHaveAttribute('href', '/mini-apps');
    expect(screen.getByRole('link', { name: 'Game SDK developer preview' })).toHaveAttribute('href', '/developers');
    expect(container.textContent).not.toMatch(/monetize|encrypted direct messages|AR filters coming soon/i);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).not.toContain('encrypted DMs');
  });

  it('explains the actual safety controls and their limits without operational guarantees', () => {
    const { container } = mount(<Safety />);
    expect(screen.getByText(/VYBE DMs are not end-to-end encrypted/)).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee that every file or message has been scanned/)).toBeInTheDocument();
    expect(screen.getByText(/Report response times are not guaranteed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Optional crash reports' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/AES-256|Plaintext only ever|before they ever go live|within 24 hours|under 13|our admins cannot/);
  });
});
