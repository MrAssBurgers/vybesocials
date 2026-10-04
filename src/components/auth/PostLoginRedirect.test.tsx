import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PostLoginRedirect } from './PostLoginRedirect';
import { getPostLoginPath, stashAuthReturnPath } from '@/lib/authReturnPath';
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
function Destination() { const location = useLocation(); return <p>{location.pathname}{location.search}{location.hash}</p>; }
function show(profile: Parameters<typeof PostLoginRedirect>[0]['profile']) {
  render(<StrictMode><MemoryRouter initialEntries={['/auth']}><Routes>
    <Route path="/auth" element={<PostLoginRedirect profile={profile} />} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter></StrictMode>);
}
it('retains the requested game code and fragment through repeated render/effect execution', () => {
  stashAuthReturnPath('/connect/game?code=ABCD-2345#request');
  show({ onboarding_completed: true, username: 'creator' });
  expect(screen.getByText('/connect/game?code=ABCD-2345#request')).toBeInTheDocument();
  expect(getPostLoginPath()).toBe('/home');
});
it('keeps the destination saved while incomplete profile onboarding is required', () => {
  stashAuthReturnPath('/connect/game?code=ABCD-2345'); show(null);
  expect(screen.getByText('/onboarding')).toBeInTheDocument();
  expect(getPostLoginPath()).toBe('/connect/game?code=ABCD-2345');
});
