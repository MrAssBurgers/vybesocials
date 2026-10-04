import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Lock, Users, Globe, Heart } from 'lucide-react';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { readVisibilitySettings, writeVisibilitySetting } from '@/lib/profileVisibilitySettings';
import { type ProfileVisibilityField, type ProfileVisibilityLevel } from '@/lib/profileVisibility';
import { isReportSessionError } from '@/lib/reportModerationService';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { SettingsSectionCard, SettingsPanel } from './SettingsUI';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FIELD_LABELS: Record<ProfileVisibilityField, string> = {
  bio: 'Bio', followers: 'Followers list', following: 'Following list', level: 'Level', activity: 'Activity status',
  location: 'Location', posts: 'Posts', clips: 'Clips', stories: 'Stories', mutual_friends: 'Mutual friends', vybe_dna: 'VYBE DNA',
};
const LEVELS: { value: ProfileVisibilityLevel; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Everyone', icon: Globe }, { value: 'friends', label: 'Friends', icon: Users },
  { value: 'close_friends', label: 'Close friends', icon: Heart }, { value: 'only_me', label: 'Only me', icon: Lock },
];
const canonical = (level: string) => level === 'everyone' ? 'public' : level === 'private' ? 'only_me' : level;
export function FriendProfileVisibilityCard() {
  const actor = useProfileAccount();
  return <VisibilitySettingsForSession key={`${actor.session.uid}:${actor.session.epoch}:${actor.profile?.id}`} />;
}
function VisibilitySettingsForSession() {
  const actor = useProfileAccount();
  const client = useQueryClient();
  const key = ['profile-visibility-settings', actor.profile?.id, actor.session.uid, actor.session.epoch];
  const query = useQuery({ queryKey: key, queryFn: () => readVisibilitySettings(actor.profile!.id, actor.guard), enabled: actor.ready,
    retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always', networkMode: 'always' });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const guard = () => { actor.guard(); if (!mounted.current) throw Object.assign(new Error('Open settings again.'), { code: 'account-changed' }); };
  const save = async (change: Parameters<typeof writeVisibilitySetting>[1]) => {
    if (busy.current || !query.isFetchedAfterMount || query.isError || !query.data) return;
    try {
      guard(); busy.current = true; setSaving(true); haptics.tap();
      const value = await writeVisibilitySetting(actor.profile!.id, change, guard);
      guard(); client.setQueryData(key, value);
      void client.invalidateQueries({ queryKey: ['profile-visibility-resolved'] });
      haptics.success(); toast.success('Visibility updated');
    } catch (error) {
      if (!isReportSessionError(error) && mounted.current) { haptics.error(); toast.error(getUserFriendlyError(error)); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const ready = actor.ready && query.isFetchedAfterMount && !query.isError && !!query.data;
  return <SettingsSectionCard title="Profile visibility" description="Choose who can see each section on your profile" icon={Eye}>
    {!actor.ready ? <p className="text-sm text-muted-foreground">Sign in to manage profile visibility.</p> : query.isError ? <div role="alert"><p>Your privacy settings could not be loaded. Nothing has been changed.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry settings</Button></div> : !ready ? <p role="status">Loading privacy settings...</p> : <SettingsPanel className="divide-y divide-border/40">
      {query.data!.needsRepair && <div className="pb-3" role="alert"><p className="text-sm">Some saved options are unavailable. Repairing keeps recognized choices, sets unavailable choices to Only me, and removes unrecognized fields.</p><Button variant="outline" disabled={saving} onClick={() => void save({ repair: true })}>Repair unavailable options</Button></div>}
      {Object.entries(FIELD_LABELS).map(([field, label]) => <fieldset key={field} className="py-3 first:pt-0 last:pb-0" disabled={saving || query.data!.needsRepair}>
        <legend className="text-sm font-medium mb-2">{label}</legend>
        {query.data!.fields[field as ProfileVisibilityField] === 'unavailable' && <p className="text-xs text-muted-foreground mb-2">Unavailable until repaired</p>}
        <div className="flex flex-wrap gap-1.5">{LEVELS.map(({ value, label: option, icon: Icon }) => <button key={value} type="button"
          aria-pressed={canonical(query.data!.fields[field as ProfileVisibilityField]) === value}
          onClick={() => void save({ field: field as ProfileVisibilityField, level: value })}
          className={cn('inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold px-2.5 rounded-full border transition-colors', canonical(query.data!.fields[field as ProfileVisibilityField]) === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
          <Icon className="h-3 w-3" />{option}</button>)}</div>
      </fieldset>)}
      <p className="pt-3 text-xs text-muted-foreground">Close friends uses the list you manage in Privacy. These choices control profile sections; they do not retract content or media you already shared elsewhere.</p>
    </SettingsPanel>}
  </SettingsSectionCard>;
}
