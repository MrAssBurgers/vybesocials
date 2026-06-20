import { getFirebaseConfig } from '@/lib/firebase/config';

/** Spotify OAuth start is an HTTP Cloud Function (not callable). */
export function getSpotifyOAuthStartUrl(authUid: string): string {
  const { functionsRegion, projectId } = getFirebaseConfig();
  const base = `https://${functionsRegion}-${projectId}.cloudfunctions.net/spotifyOauthStart`;
  const params = new URLSearchParams({ uid: authUid });
  return `${base}?${params.toString()}`;
}

/** Token exchange handler (SpotifyCallback forwards here with ?code=&state=). */
export function getSpotifyOAuthCallbackUrl(): string {
  const { functionsRegion, projectId } = getFirebaseConfig();
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/spotifyOauthCallback`;
}

/** Redirect URI registered in Spotify Developer Dashboard. */
export function getSpotifyRedirectUri(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://vybehub.app';
  return `${origin}/spotify/callback`;
}
