import { useEffect } from 'react';
import { getSpotifyOAuthCallbackUrl } from '@/lib/spotifyConnect';

/** Spotify redirects here; forward code/state to the Cloud Function token exchange. */
export default function SpotifyCallback() {
  useEffect(() => {
    const query = window.location.search || '';
    const fallback = `${window.location.origin}/settings?tab=connections&spotify=error`;

    if (!query.includes('code=') && !query.includes('error=')) {
      window.location.replace(fallback);
      return;
    }

    window.location.replace(`${getSpotifyOAuthCallbackUrl()}${query}`);
  }, []);

  return <div className="min-h-screen bg-background" />;
}
