import { useEffect, useState } from 'react';
import { Eye, Lock, Users, Globe } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { SettingsSectionCard, SettingsPanel } from './SettingsUI';
import { cn } from '@/lib/utils';

type VisibilityLevel = 'public' | 'friends' | 'close_friends' | 'only_me';

const FIELD_LABELS: Record<string, string> = {
  bio: 'Bio',
  followers: 'Followers list',
  following: 'Following list',
  level: 'Level & stats',
  activity: 'Activity status',
  location: 'Location',
  posts: 'Posts',
  clips: 'Clips',
  stories: 'Stories',
  mutual_friends: 'Mutual friends',
  vybe_dna: 'VYBE DNA',
};

const LEVELS: { value: VisibilityLevel; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Everyone', icon: Globe },
  { value: 'friends', label: 'Friends', icon: Users },
  { value: 'only_me', label: 'Only me', icon: Lock },
];

const DEFAULT_FIELDS: Record<string, VisibilityLevel> = {
  bio: 'friends',
  followers: 'public',
  following: 'public',
  level: 'friends',
  activity: 'friends',
  location: 'friends',
  posts: 'public',
  clips: 'public',
  stories: 'friends',
  mutual_friends: 'friends',
  vybe_dna: 'friends',
};

export function FriendProfileVisibilityCard() {
  const { profile } = useAuth();
  const [fields, setFields] = useState<Record<string, VisibilityLevel>>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    void db
      .from('profile_visibility')
      .select('fields')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.fields && typeof data.fields === 'object') {
          setFields({ ...DEFAULT_FIELDS, ...(data.fields as Record<string, VisibilityLevel>) });
        }
        setLoading(false);
      });
  }, [profile?.id]);

  const saveField = async (field: string, level: VisibilityLevel) => {
    if (!profile?.id) return;
    setSaving(field);
    haptics.tap();
    const next = { ...fields, [field]: level };
    try {
      const { error } = await db.from('profile_visibility').upsert(
        {
          id: profile.id,
          user_id: profile.id,
          fields: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw error;
      setFields(next);
      haptics.success();
      toast.success('Visibility updated');
    } catch (err) {
      haptics.error();
      toast.error(getUserFriendlyError(err));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return null;

  return (
    <SettingsSectionCard
      title="Friend profile visibility"
      description="Control what friends see on your private profile"
      icon={Eye}
    >
      <SettingsPanel className="divide-y divide-border/40">
        {Object.entries(FIELD_LABELS).map(([field, label]) => (
          <div key={field} className="py-3 first:pt-0 last:pb-0">
            <p className="text-sm font-medium mb-2">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map(({ value, label: lvlLabel, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving === field}
                  onClick={() => saveField(field, value)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    fields[field] === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {lvlLabel}
                </button>
              ))}
            </div>
          </div>
        ))}
      </SettingsPanel>
    </SettingsSectionCard>
  );
}
