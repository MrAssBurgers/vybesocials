import type { LivePresenceProvider } from '@/hooks/useLiveMusicPresence';

export interface ProviderTheme {
  label: string;          // "Listening on Spotify"
  shortLabel: string;     // "Listening"
  color: string;          // brand color hex
  ring: string;           // tailwind ring class (uses arbitrary value)
  ringHover: string;
}

export const PROVIDER_THEME: Record<LivePresenceProvider, ProviderTheme> = {
  spotify: {
    label: 'Listening on Spotify',
    shortLabel: 'Listening',
    color: '#1DB954',
    ring: 'ring-[#1DB954]/30',
    ringHover: 'hover:ring-[#1DB954]/60',
  },
  apple_music: {
    label: 'Listening on Apple Music',
    shortLabel: 'Listening',
    color: '#FA2D48',
    ring: 'ring-[#FA2D48]/30',
    ringHover: 'hover:ring-[#FA2D48]/60',
  },
  youtube: {
    label: 'Watching on YouTube',
    shortLabel: 'Watching',
    color: '#FF0033',
    ring: 'ring-[#FF0033]/30',
    ringHover: 'hover:ring-[#FF0033]/60',
  },
  twitch: {
    label: 'Live on Twitch',
    shortLabel: 'Live',
    color: '#9146FF',
    ring: 'ring-[#9146FF]/30',
    ringHover: 'hover:ring-[#9146FF]/60',
  },
  steam: {
    label: 'Playing on Steam',
    shortLabel: 'Playing',
    color: '#66C0F4',
    ring: 'ring-[#66C0F4]/30',
    ringHover: 'hover:ring-[#66C0F4]/60',
  },
};

export function providerTheme(p: LivePresenceProvider | null | undefined): ProviderTheme {
  return PROVIDER_THEME[p ?? 'spotify'] ?? PROVIDER_THEME.spotify;
}
