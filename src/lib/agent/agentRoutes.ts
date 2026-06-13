/** Safe in-app routes the agent may navigate to (prefix match for dynamic segments). */

export const AGENT_NAV_ALIASES: Record<string, string> = {
  home: '/home',
  feed: '/home',
  messages: '/messages',
  dms: '/messages',
  inbox: '/messages',
  notifications: '/notifications',
  notifs: '/notifications',
  search: '/search',
  settings: '/settings',
  profile: '/profile',
  me: '/profile',
  upload: '/upload',
  create: '/upload',
  post: '/upload',
  clips: '/clips',
  shorts: '/clips',
  explore: '/explore',
  market: '/market',
  shop: '/market',
  vybe_ai: '/VYBE-AI',
  ai: '/VYBE-AI',
  dna: '/vybe-dna',
  vybe_dna: '/vybe-dna',
  brief: '/brief',
  map: '/map',
  sounds: '/sounds',
  community: '/community',
  events: '/events',
  watch: '/watch',
  leaderboard: '/leaderboard',
  wallet: '/wallet',
  new_message: '/messages/new',
};

const ALLOWED_EXACT = new Set([
  '/home',
  '/brief',
  '/clips',
  '/explore',
  '/market',
  '/messages',
  '/messages/new',
  '/messages/requests',
  '/notifications',
  '/search',
  '/settings',
  '/profile',
  '/upload',
  '/VYBE-AI',
  '/vybe-dna',
  '/vybe-dna/autopilot',
  '/map',
  '/sounds',
  '/community',
  '/events',
  '/watch',
  '/leaderboard',
  '/wallet',
  '/marketplace',
  '/challenges',
  '/badges',
  '/feedback',
  '/invite-friends',
]);

const ALLOWED_PREFIXES = ['/u/', '/profile/', '/messages/', '/market/', '/sounds/', '/watch/', '/p/'];

/** Normalize user/AI path input to a safe app route, or null if blocked. */
export function normalizeAgentPath(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let path = raw.trim();
  if (!path.startsWith('/')) {
    const alias = AGENT_NAV_ALIASES[path.toLowerCase().replace(/\s+/g, '_')];
    path = alias ?? `/${path}`;
  }
  path = path.split('?')[0].split('#')[0];
  if (ALLOWED_EXACT.has(path)) return path;
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return path;
  return null;
}

export const AGENT_ROUTE_HINT = Object.values(AGENT_NAV_ALIASES)
  .filter((v, i, a) => a.indexOf(v) === i)
  .join(', ');
