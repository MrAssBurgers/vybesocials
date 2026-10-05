import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { MapViewport } from './MapViewport';

afterEach(cleanup);
function RouteChild() {
  const navigate = useNavigate();
  const location = useLocation();
  return <MapViewport><main aria-label="Map"><button onClick={() => navigate('/messages')}>{location.pathname}</button></main></MapViewport>;
}
it('escapes a collapsed transformed route wrapper and retains router context and cleanup', () => {
  const view = render(<MemoryRouter initialEntries={['/map']}><div data-testid="route" style={{ height: 0, transform: 'translateX(0)', contain: 'paint' }}><RouteChild /></div></MemoryRouter>);
  const viewport = screen.getByRole('main', { name: 'Map' }).parentElement!;
  expect(viewport.parentElement).toBe(document.body);
  expect(viewport).toHaveClass('fixed', 'inset-0');
  expect(viewport.style.height).toBe('100dvh');
  expect(screen.getByTestId('route')).not.toContainElement(viewport);
  fireEvent.click(screen.getByRole('button', { name: '/map' }));
  expect(screen.getByRole('button', { name: '/messages' })).toBeInTheDocument();
  view.unmount();
  expect(document.querySelector('[data-map-viewport]')).toBeNull();
});
