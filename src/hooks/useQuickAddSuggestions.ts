import { usePeopleDiscovery } from './usePeopleDiscovery';
import { useDismissedQuickAdd } from './useDismissedQuickAdd';

export interface QuickAddUser {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  mutual_count: number; subtitle: string;
}

/** Rank only current Firebase-admitted candidates; failures remain retryable. */
export function useQuickAddSuggestions(limit = 8) {
  const discovery = usePeopleDiscovery();
  const { isDismissed } = useDismissedQuickAdd();
  const interests = new Set((discovery.actor.profile?.interests || []).map(value => value.toLowerCase()));
  const ranked = (discovery.data?.profiles || []).filter(profile => !isDismissed(profile.id)).map(profile => {
    const shared = [...new Set(profile.interests.map(value => value.toLowerCase()))].filter(value => interests.has(value));
    return { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url,
      mutual_count: profile.mutual_count,
      subtitle: profile.mutual_count > 0 ? `${profile.mutual_count} mutual friend${profile.mutual_count === 1 ? '' : 's'}`
        : shared.length ? shared.slice(0, 2).join(' · ') : `@${profile.username}`,
      score: profile.mutual_count * 100 + shared.length * 4 + (profile.avatar_url ? 2 : 0) + (profile.display_name ? 1 : 0) };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { suggestions: ranked.slice(0, limit).map(({ score: _score, ...profile }) => profile),
    isLoading: discovery.isLoading, error: discovery.error,
    ageReviewRequired: discovery.data?.ageReviewRequired ?? false, retry: discovery.retry };
}
