import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContentFlag {
  id: string;
  content_type: string;
  content_id: string;
  flagged_text: string | null;
  ai_score: number | null;
  ai_categories: Record<string, boolean> | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  reporter?: { username: string; avatar_url: string | null };
  post?: { caption: string | null; media_url: string };
}

export function useContentFlags() {
  return useQuery({
    queryKey: ['content-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_flags')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContentFlag[];
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          reporter:profiles!reports_reporter_id_fkey(username, avatar_url),
          post:posts!reports_post_id_fkey(caption, media_url)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Report[];
    },
  });
}

export function useUpdateFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      reviewed_by 
    }: { 
      id: string; 
      status: 'approved' | 'rejected'; 
      reviewed_by: string;
    }) => {
      const { error } = await supabase
        .from('content_flags')
        .update({ 
          status, 
          reviewed_by, 
          reviewed_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-flags'] });
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      reviewed_by,
      admin_notes 
    }: { 
      id: string; 
      status: 'reviewed' | 'dismissed' | 'actioned'; 
      reviewed_by: string;
      admin_notes?: string;
    }) => {
      const { error } = await supabase
        .from('reports')
        .update({ 
          status, 
          reviewed_by, 
          reviewed_at: new Date().toISOString(),
          admin_notes 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });
}

export function useUserRole() {
  return useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data?.role as 'admin' | 'moderator' | 'user' | null;
    },
  });
}

export async function moderateContent(
  content: string, 
  contentType: 'post' | 'comment' | 'message' | 'profile',
  contentId: string
): Promise<{ allowed: boolean; score: number; requires_review: boolean }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderate-content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ content, content_type: contentType, content_id: contentId }),
      }
    );

    if (!response.ok) {
      console.error('Moderation API error:', response.status);
      return { allowed: true, score: 0, requires_review: false };
    }

    return await response.json();
  } catch (error) {
    console.error('Moderation error:', error);
    return { allowed: true, score: 0, requires_review: false };
  }
}
