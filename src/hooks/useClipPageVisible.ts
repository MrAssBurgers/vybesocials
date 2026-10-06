import { useEffect, useState } from 'react';

/** Resume through the card's autoplay policy when the app returns to the foreground. */
export function useClipPageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    let paused = false;
    const update = () => setVisible(!paused && document.visibilityState !== 'hidden');
    const pause = () => { paused = true; update(); };
    const resume = () => { paused = false; update(); };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('app-paused', pause);
    window.addEventListener('app-resumed', resume);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('app-paused', pause);
      window.removeEventListener('app-resumed', resume);
    };
  }, []);
  return visible;
}
