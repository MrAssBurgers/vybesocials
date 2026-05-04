import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * DEV-ONLY visual diff page.
 * Renders each marketing-page phone mockup next to a live iframe of the real
 * app screen so you can eyeball drift after UI changes.
 *
 * Only mounted in development (see AnimatedRoutes.tsx).
 * Route: /dev/mockup-compare
 */

const VybeHome = lazy(() => import('@/pages/VybeHome'));

const SCREENS: { key: string; label: string; realPath: string; mockupAnchor: string }[] = [
  { key: 'feed',  label: 'Home Feed',  realPath: '/home',     mockupAnchor: 'mock-feed' },
  { key: 'dna',   label: 'VYBE DNA',   realPath: '/dna',      mockupAnchor: 'mock-dna' },
  { key: 'map',   label: 'Friend Map', realPath: '/map',      mockupAnchor: 'mock-map' },
  { key: 'chat',  label: 'Chat',       realPath: '/messages', mockupAnchor: 'mock-chat' },
];

export default function DevMockupCompare() {
  const [active, setActive] = useState(SCREENS[0]);

  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-white bg-[#0B0B10]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not available in production</h1>
          <Link to="/" className="text-violet-400 underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0B0B10] text-white">
      <header className="sticky top-0 z-50 bg-[#0B0B10]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <h1 className="font-bold">Mockup ↔ Real Comparison</h1>
        <span className="text-xs text-white/50">dev only</span>
        <div className="ml-auto flex gap-1.5">
          {SCREENS.map(s => (
            <button
              key={s.key}
              onClick={() => setActive(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                active.key === s.key
                  ? 'bg-white text-[#0B0B10] border-white'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-4 p-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-3 py-2 text-xs uppercase tracking-wider text-violet-300 border-b border-white/10">
            Marketing mockup — {active.label}
          </div>
          <div className="relative h-[760px] overflow-hidden">
            <Suspense fallback={<div className="p-6 text-white/60">Loading…</div>}>
              {/* Render the marketing page in an iframe so its phone mockups render naturally */}
              <iframe
                title="marketing"
                src="/vybe-home"
                className="absolute inset-0 w-full h-full border-0"
              />
            </Suspense>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-3 py-2 text-xs uppercase tracking-wider text-cyan-300 border-b border-white/10">
            Real app — {active.realPath}
          </div>
          <div className="relative h-[760px] overflow-hidden">
            <iframe
              key={active.realPath}
              title="real-app"
              src={active.realPath}
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        </section>
      </div>

      <p className="px-4 pb-8 text-xs text-white/40 max-w-3xl">
        Tip: log in to the real app first in this browser, then reload this page so the right-side
        iframe renders the authenticated screens. Use this view to spot spacing, typography, header,
        and bottom-nav drift between the marketing previews and the live app.
      </p>
    </div>
  );
}
