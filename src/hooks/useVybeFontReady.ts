import { useEffect, useState } from 'react';

/** True when the custom Vybe Font webfont has loaded (woff2/otf/ttf in /public/fonts/). */
export function useVybeFontReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      try {
        setReady(document.fonts.check('400 1em "Vybe Font"'));
      } catch {
        setReady(false);
      }
    };

    if (document.fonts?.load) {
      document.fonts.load('400 1em "Vybe Font"').then(check, check);
    } else {
      check();
    }

    const t = window.setTimeout(check, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  return ready;
}
