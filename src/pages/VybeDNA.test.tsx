import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ dna: {} as Record<string, unknown>, retry: vi.fn(), apply: vi.fn() }));
vi.mock('@/hooks/useVybeDNA', () => ({ useVybeDNA: () => mock.dna }));
vi.mock('@/components/dna/DNAAutoPilot', () => ({ DNAAutoPilot: () => <button onClick={mock.apply}>Apply verified suggestion</button> }));
vi.mock('@/components/dna/DNAOrb', () => ({ DNAOrb: () => <div>Personality visualization</div> }));
vi.mock('@/components/dna/PersonalityArchetype', () => ({ PersonalityArchetype: () => null }));
vi.mock('@/components/dna/DNATraitBars', () => ({ DNATraitBars: () => null }));
vi.mock('@/components/dna/DNAColorPalette', () => ({ DNAColorPalette: () => null }));
vi.mock('@/components/dna/DNAInsights', () => ({ DNAInsights: () => null }));
vi.mock('@/components/dna/DNAPerks', () => ({ DNAPerks: () => null }));
vi.mock('@/components/dna/DNASimilarUsers', () => ({ DNASimilarUsers: () => null }));
vi.mock('@/components/dna/DNAChatAssistant', () => ({ DNAChatAssistant: () => null }));
import VybeDNAPage from './VybeDNA';
beforeEach(() => { vi.clearAllMocks(); mock.dna = { data: undefined, isLoading: false, isPending: false, isFetching: false, isError: false, refetch: mock.retry }; });
afterEach(cleanup);
const show = () => render(<MemoryRouter><VybeDNAPage /></MemoryRouter>);
it.each(['pending', 'empty', 'error', 'seed'])('keeps verified Auto-Pilot reachable while personality is %s', state => {
  if (state === 'pending') mock.dna.isPending = true;
  if (state === 'error') mock.dna.isError = true;
  if (state === 'seed') mock.dna.data = { id: 'seed', personality_vector: { activity: 0.15 } };
  show(); fireEvent.click(screen.getByRole('button', { name: 'Apply verified suggestion' })); expect(mock.apply).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Personality visualization')).not.toBeInTheDocument();
  if (state === 'pending') expect(screen.getByRole('status')).toHaveTextContent('Loading your personality panel');
  else { fireEvent.click(screen.getByRole('button', { name: 'Retry personality panel' })); expect(mock.retry).toHaveBeenCalledTimes(1); }
});
