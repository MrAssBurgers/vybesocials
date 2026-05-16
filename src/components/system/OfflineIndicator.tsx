import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Subtle pill that floats above the bottom nav when offline,
 * and briefly confirms "Back online" on reconnect.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setShowBackOnline(false);
    };
    const goOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      window.setTimeout(() => setShowBackOnline(false), 2200);
    };
    window.addEventListener('vybe:offline', goOffline);
    window.addEventListener('vybe:online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('vybe:offline', goOffline);
      window.removeEventListener('vybe:online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !showBackOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border backdrop-blur-md transition-all duration-300 ${
          online
            ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
            : 'bg-card/90 text-foreground border-border'
        }`}
      >
        {online ? (
          <>
            <Wifi className="w-3.5 h-3.5" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline — showing saved content</span>
          </>
        )}
      </div>
    </div>
  );
}
