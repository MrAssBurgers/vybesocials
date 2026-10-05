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
