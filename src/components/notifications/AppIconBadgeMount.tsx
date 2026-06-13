import { useAppIconBadge } from '@/hooks/useAppIconBadge';

/** Renders nothing; syncs dock/home-screen badge count. */
export function AppIconBadgeMount() {
  useAppIconBadge();
  return null;
}
