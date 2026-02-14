import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface SafetySettings {
  id: string;
  user_id: string;
  content_filter_level: 'protected' | 'moderate' | 'minimal';
  dm_filter: 'everyone' | 'friends_only' | 'nobody';
  message_requests_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  muted_keywords: string[];
  show_global_events: boolean;
  take_a_break_reminder: boolean;
  break_reminder_interval_hours: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: Omit<SafetySettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  content_filter_level: 'moderate',
  dm_filter: 'friends_only',
  message_requests_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_keywords: [],
  show_global_events: true,
  take_a_break_reminder: true,
  break_reminder_interval_hours: 2,
};

export function useSafetySettings() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['safety-settings', profile?.id],
    queryFn: async () => {
      if (!profile) return null;

      const { data, error } = await supabase
        .from('user_safety_settings')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;

      // Return defaults if no settings exist
      if (!data) {
        return {
          ...DEFAULT_SETTINGS,
          user_id: profile.id,
        } as SafetySettings;
      }

      return data as SafetySettings;
    },
    enabled: !!profile,
  });
}

export function useUpdateSafetySettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (updates: Partial<SafetySettings>) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_safety_settings')
        .upsert({
          user_id: profile.id,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-settings'] });
    },
  });
}

// Get age-appropriate default settings
export function getAgeAppropriateDefaults(age: number): Partial<SafetySettings> {
  if (age < 16) {
    return {
      content_filter_level: 'protected',
      dm_filter: 'friends_only',
      message_requests_enabled: false,
      take_a_break_reminder: true,
      break_reminder_interval_hours: 1,
    };
  } else if (age < 18) {
    return {
      content_filter_level: 'moderate',
      dm_filter: 'friends_only',
      message_requests_enabled: true,
      take_a_break_reminder: true,
    };
  } else {
    return {
      content_filter_level: 'moderate',
      dm_filter: 'friends_only',
      message_requests_enabled: true,
    };
  }
}

// Check if user can access minimal filtering (18+ only)
export function canAccessMinimalFiltering(dateOfBirth: string | null): boolean {
  if (!dateOfBirth) return false;
  
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age >= 18;
}

// Calculate age from date of birth
export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}
