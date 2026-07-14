import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export interface StoryHighlight {
  id: string;
  owner_id: string;
  title: string;
  cover_url?: string | null;
  story_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export function useStoryHighlights(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['story-highlights', ownerId],
    queryFn: async (): Promise<StoryHighlight[]> => {
      if (!ownerId) return [];
      const { data, error } = await db
        .from('story_highlights')
        .select('id, owner_id, title, cover_url, story_ids, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) {
        console.warn('[useStoryHighlights]', error.message);
        return [];
      }
      return (data || []) as StoryHighlight[];
    },
    enabled: !!ownerId,
    staleTime: 60_000,
  });
}

export function useCreateStoryHighlight() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { title: string; cover_url?: string | null; story_ids?: string[] }) => {
      if (!profileId) throw new Error('Not signed in');
      const now = new Date().toISOString();
      const { data, error } = await db
        .from('story_highlights')
        .insert({
          owner_id: profileId,
          title: input.title.trim() || 'Highlight',
          cover_url: input.cover_url ?? null,
          story_ids: input.story_ids ?? [],
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['story-highlights', profileId] });
    },
  });
}
