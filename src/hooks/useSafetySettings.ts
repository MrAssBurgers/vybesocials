import { useSyncExternalStore } from 'react';
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe } from '@/lib/reportModerationService';
import { useQuery, useMutation, useQueryClient, onlineManager } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface SafetySettings {
  id: string;
  user_id: string;
  content_filter_level: 'protected' | 'moderate' | 'minimal';
  dm_filter: 'everyone' | 'friends_only' | 'nobody';
  dm_content_filter_enabled: boolean;
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
  dm_content_filter_enabled: true,
  message_requests_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_keywords: [],
  show_global_events: true,
  take_a_break_reminder: true,
  break_reminder_interval_hours: 2,
};

export type SafetySettingsUpdate = Partial<Omit<SafetySettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
function validUpdates(updates: SafetySettingsUpdate) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)
    || Object.keys(updates).some(key => !Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key))) throw new Error('Use valid safety settings.');
  for (const [key, value] of Object.entries(updates)) {
    const valid = key === 'content_filter_level' ? typeof value === 'string' && ['protected', 'moderate', 'minimal'].includes(value)
      : key === 'dm_filter' ? typeof value === 'string' && ['everyone', 'friends_only', 'nobody'].includes(value)
      : key === 'quiet_hours_start' || key === 'quiet_hours_end' ? value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      : key === 'muted_keywords' ? Array.isArray(value) && value.length <= 100 && value.every(word => typeof word === 'string' && word.trim().length > 0 && word.length <= 100)
      : key === 'break_reminder_interval_hours' ? Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 24
      : typeof value === 'boolean';
    if (!valid) throw new Error('Use valid safety settings.');
  }
  return updates;
}
function ownedSafetyRow(row: SafetySettings | null, profileId: string) {
  if (row && (row.user_id !== profileId || typeof row.id !== 'string' || !row.id || row.id.includes('/'))) {
    throw new Error('These safety settings need an ownership review. Nothing was changed.');
  }
}

export function useSafetySettings() {
  const { user, profile } = useAuth();
  const account = useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, reportAccountSnapshot);
  return useQuery({
    queryKey: ['safety-settings', profile?.id, account.epoch],
    queryFn: async () => {
      if (!profile || !user) return null;
      const guard = reportAccountGuard(user.id); guard();
      const { data, error } = await db.from('user_safety_settings').select('*').eq('user_id', profile.id).maybeSingle();
      guard();
      if (error) throw error;
      ownedSafetyRow(data as SafetySettings | null, profile.id);
      return data ? { ...DEFAULT_SETTINGS, ...data } as SafetySettings : { ...DEFAULT_SETTINGS, user_id: profile.id } as SafetySettings;
    },
    enabled: !!profile && !!user && account.uid === user.id,
  });
}

export function useUpdateSafetySettings() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const account = useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, reportAccountSnapshot);
  return useMutation({
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    mutationFn: async (updates: SafetySettingsUpdate) => {
      if (!profile || !user || account.uid !== user.id || reportAccountSnapshot().epoch !== account.epoch) throw new Error('Reopen safety settings for your current account.');
      const guard = reportAccountGuard(user.id); guard();
      validUpdates(updates);
      if (!onlineManager.isOnline()) throw new Error('Connect to the internet before saving safety settings.');
      // The legacy adapter otherwise picks profile.id and refreshes created_at on
      // every upsert, potentially duplicating a historical differently keyed row.
      const existing = await db.from('user_safety_settings').select('*').eq('user_id', profile.id).maybeSingle();
      guard(); if (existing.error) throw existing.error;
      ownedSafetyRow(existing.data as SafetySettings | null, profile.id);
      const now = new Date().toISOString();
      const { data, error } = await db.from('user_safety_settings').upsert({
        ...updates, id: existing.data?.id ?? profile.id, user_id: profile.id,
        created_at: existing.data?.created_at ?? now, updated_at: now,
      }, { onConflict: 'user_id' }).select().single();
      guard(); if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (reportAccountSnapshot().uid === user?.id && reportAccountSnapshot().epoch === account.epoch) {
        void queryClient.invalidateQueries({ queryKey: ['safety-settings', profile?.id, account.epoch], exact: true });
      }
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
  return (calculateAge(dateOfBirth) ?? 0) >= 18;
}

// Check if user can toggle DM content filter (must be 13+)
export function canToggleDMFilter(dateOfBirth: string | null): boolean {
  if (!dateOfBirth) return false;
  return (calculateAge(dateOfBirth) ?? 0) >= 13;
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
