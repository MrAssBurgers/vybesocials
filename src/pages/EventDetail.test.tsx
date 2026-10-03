import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventDetailPage from './EventDetail';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/events/EventReminderButton', () => ({
  EventReminderButton: () => <button type="button">Remind me</button>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' } }) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const event = {
  id: 'evt-1',
  title: 'Night market',
  description: 'Food, music, and friends.',
  start_time: '2099-06-01T20:00:00.000Z',
  end_time: null,
  location: 'Downtown',
  online_link: null,
  event_type: 'in-person' as const,
  cover_image: null,
  rsvp_count: 3,
  user_rsvp: null,
  host: { id: 'h1', username: 'nova', avatar_url: null, is_verified: false },
};

vi.mock('@/hooks/useEvents', () => ({
  useEvent: () => ({ data: event, isLoading: false, isError: false }),
  useEventAttendees: () => ({
    data: [{ id: 'rsvp-1', user: { id: 'u2', username: 'kai', avatar_url: null } }],
  }),
  useEventRSVP: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe('EventDetail', () => {
  it('shows the event instead of the events list', () => {
    render(
      <MemoryRouter initialEntries={['/events/evt-1']}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Night market' })).toBeInTheDocument();
    expect(screen.getByText('Food, music, and friends.')).toBeInTheDocument();
    expect(screen.getByText('Downtown')).toBeInTheDocument();
    expect(screen.getByText('nova')).toBeInTheDocument();
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Going' })).toBeInTheDocument();
  });
});
