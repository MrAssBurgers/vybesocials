import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface SimilarDNAUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  similarity: number; // 0-100
  dominant_trait: string;
}

/**
 * Find users with similar VYBE DNA personality vectors.
 * Compares the current user's activity/social/creative scores 
 * against all other users with DNA data via cosine-like distance.
 */
export function useSimilarDNAUsers(limit = 10) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['similar-dna-users', user?.id],
    queryFn: async (): Promise<SimilarDNAUser[]> => {
      if (!user?.id) return [];

      // Get current user's profile id
      const { data: myProfile } = await db
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myProfile) return [];

      // Get my DNA
      const { data: myDna } = await db
        .from('vybe_dna' as any)
        .select('personality_vector')
        .eq('user_id', myProfile.id)
        .maybeSingle();

      if (!myDna) return [];

      const myPv = (myDna as any).personality_vector as Record<string, number>;
      if (!myPv) return [];

      const myA = myPv.activity ?? 0;
      const myS = myPv.social ?? 0;
      const myC = myPv.creative ?? 0;

      // Get all other users' DNA
      const { data: allDna } = await db
        .from('vybe_dna' as any)
        .select('user_id, personality_vector')
        .neq('user_id', myProfile.id)
        .limit(200);

      if (!allDna || allDna.length === 0) return [];

      // Get my about data for lifestyle matching
      const { data: myAbout } = await db
        .from('user_about' as any)
        .select('mbti, music_genres, streaming_services')
        .eq('user_id', myProfile.id)
        .maybeSingle();

      const myMbti = (myAbout as any)?.mbti as string | null;
      const myGenres = ((myAbout as any)?.music_genres || []) as string[];
      const myStreaming = ((myAbout as any)?.streaming_services || []) as string[];

      // Batch fetch about data for other users
      const otherIds = (allDna as any[]).map((d: any) => d.user_id);
      const { data: allAbout } = await db
        .from('user_about' as any)
        .select('user_id, mbti, music_genres, streaming_services')
        .in('user_id', otherIds);

      const aboutMap = new Map((allAbout as any[] || []).map((a: any) => [a.user_id, a]));

      // Calculate similarity for each
      const scored = (allDna as any[]).map((d: any) => {
        const pv = d.personality_vector as Record<string, number>;
        const a = pv?.activity ?? 0;
        const s = pv?.social ?? 0;
        const c = pv?.creative ?? 0;

        // Euclidean distance (lower = more similar), normalized to 0-100 similarity
        const dist = Math.sqrt(
          Math.pow(myA - a, 2) +
          Math.pow(myS - s, 2) +
          Math.pow(myC - c, 2)
        );
        const maxDist = Math.sqrt(3);
        let similarity = (1 - dist / maxDist) * 100;

        // Bonus points for lifestyle matches
        const theirAbout = aboutMap.get(d.user_id) as any;
        if (theirAbout) {
          // MBTI match bonus (+8)
          if (myMbti && theirAbout.mbti === myMbti) similarity += 8;

          // Music genre overlap bonus (up to +10)
          const theirGenres = (theirAbout.music_genres || []) as string[];
          if (myGenres.length > 0 && theirGenres.length > 0) {
            const overlap = myGenres.filter((g: string) => theirGenres.includes(g)).length;
            const maxOverlap = Math.max(myGenres.length, theirGenres.length);
            similarity += (overlap / maxOverlap) * 10;
          }

          // Streaming service overlap bonus (up to +4)
          const theirStreaming = (theirAbout.streaming_services || []) as string[];
          if (myStreaming.length > 0 && theirStreaming.length > 0) {
            const overlap = myStreaming.filter((s: string) => theirStreaming.includes(s)).length;
            similarity += Math.min(overlap * 2, 4);
          }
        }

        similarity = Math.min(Math.round(similarity), 100);

        const dominant = a >= s && a >= c ? 'Activity' : s >= c ? 'Social' : 'Creative';

        return {
          user_id: d.user_id as string,
          similarity,
          dominant_trait: dominant,
        };
      });

      // Sort by similarity descending, take top N
      scored.sort((a, b) => b.similarity - a.similarity);
      const topIds = scored.slice(0, limit);

      if (topIds.length === 0) return [];

      // Fetch profiles for top matches
      const { data: profiles } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', topIds.map(t => t.user_id));

      if (!profiles) return [];

      const profileMap = new Map<string, any>((profiles as any[]).map((p: any) => [p.id, p]));

      return topIds
        .map(t => {
          const p = profileMap.get(t.user_id);
          if (!p) return null;
          return {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            similarity: t.similarity,
            dominant_trait: t.dominant_trait,
          };
        })
        .filter(Boolean) as SimilarDNAUser[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}
