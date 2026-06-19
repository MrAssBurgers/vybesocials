import { getFirebaseConfig } from '@/lib/firebase/config';

/** Spotify OAuth start is an HTTP Cloud Function (not callable). */
export function getSpotifyOAuthStartUrl(authUid: string, returnTo?: string): string {
  const { functionsRegion, projectId } = getFirebaseConfig();
  const base = `https://${functionsRegion}-${projectId}.cloudfunctions.net/spotifyOauthStart`;
  const params = new URLSearchParams({ uid: authUid });
  if (returnTo) params.set('returnTo', returnTo);
  return `${base}?${params.toString()}`;
}
