import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_GRADIENTS, FRAME_COLORS } from '@/lib/cosmeticConstants';
const mock = vi.hoisted(() => ({ equip: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'alice', username: 'alice' } }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useBadges', () => ({ useUserBadges: () => ({ data: [] }), useAllBadges: () => ({ data: [] }) }));
vi.mock('@/hooks/useUserRoleById', () => ({ useUserRoleById: () => ({ data: null }) }));
vi.mock('@/components/ui/OwnerBadge', () => ({ isOwner: () => false }));
vi.mock('@/components/ui/OwnerWifeRingBadge', () => ({ isOwnerWife: () => false }));
vi.mock('@/components/badges/FounderBadge', () => ({ FounderBadge: () => null }));
vi.mock('./PurchasedItems', () => ({ PurchasedItems: () => null }));
vi.mock('@/lib/haptics', () => ({ haptics: { select: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useLockerItems', () => {
  const item = (id: string, name: string) => ({ id, equip_value: id, reward_name: name, reward_type: id.startsWith('theme') ? 'profile_theme' : 'cosmetic', reward_icon: '⭐', unlocked: true, level: 1 });
  return { useEquipItem: () => ({ mutate: mock.equip, isPending: false }), useLockerItems: () => ({ equipmentReady: true, data: {
    titles: [], effects: [], name_colors: [], userLevel: 1,
    cosmetics: [item('avatar_frame_gold', 'Gold Avatar Frame'), item('avatar_frame_fire', 'Fire Avatar Frame')],
    profile_themes: [item('theme_neon', 'Neon Nights Profile Effect'), item('theme_ocean', 'Deep Ocean Profile Effect')],
  } }) };
});
import { ProfileLocker } from './ProfileLocker';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount() { const client = new QueryClient(); return render(<QueryClientProvider client={client}><MemoryRouter><ProfileLocker /></MemoryRouter></QueryClientProvider>); }
describe('purchased locker visual and equipment keys', () => {
  it.each([['theme_neon', 'Neon Nights Profile Effect'], ['theme_ocean', 'Deep Ocean Profile Effect']])('renders and equips the %s gradient by its equipment value', (id, name) => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Themes', exact: true }));
    const card = screen.getByRole('button', { name: new RegExp(name) });
    const preview = Array.from(card.querySelectorAll<HTMLElement>('[style]')).find(node => node.style.background.includes('linear-gradient'));
    expect(preview).toHaveStyle({ background: THEME_GRADIENTS[id] });
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(card); fireEvent.click(screen.getByRole('button', { name: 'EQUIP', exact: true }));
    expect(mock.equip).toHaveBeenCalledWith({ type: 'profile_theme', value: id }, expect.any(Object));
  });
  it.each([['avatar_frame_gold', 'Gold Avatar Frame'], ['avatar_frame_fire', 'Fire Avatar Frame']])('renders %s with its frame preview', (id, name) => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Frames', exact: true }));
    const card = screen.getByRole('button', { name: new RegExp(name) });
    expect(Array.from(card.querySelectorAll<HTMLElement>('[style]')).some(node => node.style.boxShadow.includes(FRAME_COLORS[id]))).toBe(true);
  });
});
