import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import './auth-atmosphere.css';

/** Decorative light stays behind the form and never delays authentication. */
export function AuthAtmosphere({ busy = false, signup = false }: { busy?: boolean; signup?: boolean }) {
  return <div className="auth-atmosphere" data-busy={busy} data-signup={signup} aria-hidden="true">
    <span className="auth-light auth-light-cyan" />
    <span className="auth-light auth-light-violet" />
    <span className="auth-light auth-light-rose" />
    <span className="auth-orbit auth-orbit-one" />
    <span className="auth-orbit auth-orbit-two" />
  </div>;
}

/** Only geometry drives the light: field contents never enter animation state. */
export function AuthWaveSurface({ children, busy = false, signup = false, className = '' }: { children: ReactNode; busy?: boolean; signup?: boolean; className?: string }) {
  const sequence = useRef(0);
  const lastWave = useRef(0);
  const warmed = useRef(false);
  const [waves, setWaves] = useState<{ id: number; x: number; y: number }[]>([]);
  const react = (event: SyntheticEvent<HTMLDivElement>) => {
    if (!warmed.current) {
      warmed.current = true;
      void import('@/lib/loginEmail').catch(() => {});
    }
    if (Date.now() - lastWave.current < 450) return;
    lastWave.current = Date.now();
    const surface = event.currentTarget.getBoundingClientRect();
    const target = (event.target as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (target.left + target.width / 2 - surface.left) / Math.max(surface.width, 1) * 100));
    const y = Math.max(0, Math.min(100, (target.top + target.height / 2 - surface.top) / Math.max(surface.height, 1) * 100));
    setWaves(previous => [...previous.slice(-1), { id: ++sequence.current, x, y }]);
  };
  return <div className={`auth-wave-surface ${className}`} data-busy={busy} data-signup={signup}
    onFocusCapture={react} onPointerDownCapture={react} onInputCapture={react}>
    <div className="auth-wave-field" aria-hidden="true">
      {busy && [0, 1, 2].map(index => <span key={`busy-${index}`} className="auth-wave auth-wave-working" style={{ animationDelay: `${index * -.8}s` }} />)}
      {waves.map(wave => <span key={wave.id} className="auth-wave auth-wave-response" style={{ left: `${wave.x}%`, top: `${wave.y}%` }}
        onAnimationEnd={() => setWaves(previous => previous.filter(item => item.id !== wave.id))} />)}
    </div>
    {children}
  </div>;
}
