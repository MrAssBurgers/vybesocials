import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { getDocumentsFromServer, where, orderBy, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { useStoryAccount } from '@/hooks/useStoryAccount';
import { isStorySessionCurrent } from '@/lib/storiesQueryKey';

export interface StoryHighlight {
  id: string; owner_id: string; title: string; cover_url?: string | null;
  story_ids?: string[]; created_at?: string; updated_at?: string;
}

/** Legacy highlights can contain private bearer covers; only their owner reads them. */
export function useStoryHighlights(ownerId: string | undefined) {
  const { profile, session, ready, guard } = useStoryAccount();
  const own = ready && !!ownerId && ownerId === profile!.id;
  const query = useQuery({
    queryKey: ['story-highlights', ownerId, session.uid, session.epoch],
    queryFn: async () => {
      guard();
      if (!own) throw new Error('Highlights are unavailable.');
      const data = await getDocumentsFromServer<StoryHighlight>('story_highlights', [where('owner_id', '==', ownerId), orderBy('updated_at', 'desc'), firestoreLimit(30)]);
      guard(); return data.filter(row => row.owner_id === ownerId);
    },
    enabled: own, retry: false, gcTime: 0, staleTime: 0, networkMode: 'always',
    refetchInterval: 15_000, refetchOnWindowFocus: 'always', placeholderData: undefined,
  });
  return { ...query, data: own && isStorySessionCurrent(session) && !query.isError ? query.data : undefined };
}

export function useCreateStoryHighlight() {
  const { profile, session, guard } = useStoryAccount();
  const qc = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const check = () => { guard(); if (!alive.current) throw new Error('This view has closed.'); };
  return useMutation({
    mutationFn: async (input: { title: string; cover_url?: string | null; story_ids?: string[] }) => {
      check();
      const now = new Date().toISOString();
      const { data, error } = await db.from('story_highlights').insert({ owner_id: profile!.id,
        title: input.title.trim() || 'Highlight', cover_url: input.cover_url ?? null, story_ids: input.story_ids ?? [],
        created_at: now, updated_at: now }).select('id').maybeSingle();
      check(); if (error) throw error;
      void qc.invalidateQueries({ queryKey: ['story-highlights', profile!.id, session.uid, session.epoch], exact: true });
      return data;
    },
  });
}
