import { useEffect } from 'react';

export default function SpotifyCallback() {
  useEffect(() => {
    const query = window.location.search || '';
    const fallback = `${window.location.origin}/settings?spotify=error`;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-oauth-callback${query}`;

    if (!query.includes('code=') && !query.includes('error=')) {
      window.location.replace(fallback);
      return;
    }

    window.location.replace(url);
  }, []);

  return <div className="min-h-screen bg-background" />;
}