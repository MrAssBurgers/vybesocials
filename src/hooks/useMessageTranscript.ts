import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

export type TranscriptStatus = 'none' | 'pending' | 'ready' | 'failed';

export interface MessageTranscript {
  message_id: string;
  text: string;
  language?: string | null;
  status: TranscriptStatus;
  segments?: { start_ms: number; end_ms: number; text: string }[];
  updated_at?: string;
}

export function useMessageTranscript(messageId?: string | null) {
  return useQuery({
    queryKey: ['message-transcript', messageId],
    enabled: !!messageId,
    queryFn: async (): Promise<MessageTranscript | null> => {
      if (!messageId) return null;
      const { data, error } = await db
        .from('message_transcripts')
        .select('*')
        .eq('message_id', messageId)
        .maybeSingle();
      if (error) {
        console.warn('[useMessageTranscript] load failed', error);
        return null;
      }
      return (data as MessageTranscript) ?? null;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' ? 3000 : false;
    },
    staleTime: 5_000,
  });
}
