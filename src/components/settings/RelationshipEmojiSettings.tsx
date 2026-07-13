import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RELATIONSHIP_EMOJIS,
  DEFAULT_STREAK_EMOJIS,
  RELATIONSHIP_STATE_LABELS,
  type RelationshipEmojiPackId,
} from '@/lib/relationship/relationshipEmojiMap';
import {
  saveRelationshipEmojiPreferences,
  updateFriendshipPreferences,
  useRelationshipEmojiPreferences,
} from '@/hooks/useRelationshipEmojiPreferences';
import { isRelationshipEmojiUiEnabled } from '@/lib/relationshipFeatureFlags';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { PrimaryRelationshipState } from '@/lib/relationship/relationshipTypes';

const PACKS: Array<{ id: RelationshipEmojiPackId; label: string }> = [
  { id: 'classic', label: 'Classic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'cosmic', label: 'Cosmic' },
  { id: 'cute', label: 'Cute' },
];

const EDITABLE_STATES: PrimaryRelationshipState[] = [
  'best_friend',
  'number_one',
  'close_number_one',
  'forever_number_one',
  'mutual_number_one',
  'mutual_best_friend',
  'rising_friend',
  'new_close_friend',
  'cooling_down',
];

export function RelationshipEmojiSettings() {
  const profileId = useAuthProfileId();
  const enabled = isRelationshipEmojiUiEnabled(profileId);
  const { data: prefs, refetch } = useRelationshipEmojiPreferences(enabled ? profileId : null);
  const [saving, setSaving] = useState(false);
  const [showCooling, setShowCooling] = useState(Boolean(prefs?.show_cooling_down));

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Relationship emoji customization is rolling out gradually.
      </p>
    );
  }

  const handleSavePack = async (packId: RelationshipEmojiPackId) => {
    setSaving(true);
    try {
      await saveRelationshipEmojiPreferences({ pack_id: packId });
      await refetch();
      toast.success('Emoji pack updated');
    } catch {
      toast.error('Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCooling = async (checked: boolean) => {
    setShowCooling(checked);
    setSaving(true);
    try {
      await updateFriendshipPreferences({ show_cooling_down: checked });
      await refetch();
    } catch {
      toast.error('Could not save preference');
      setShowCooling(!checked);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Relationship Emojis</h3>
        <p className="text-sm text-muted-foreground">
          Customize how friendship states appear in your inbox. Only you see your emoji choices.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Emoji pack</Label>
        <div className="flex flex-wrap gap-2">
          {PACKS.map((pack) => (
            <Button
              key={pack.id}
              type="button"
              size="sm"
              variant={prefs?.pack_id === pack.id ? 'default' : 'outline'}
              disabled={saving}
              onClick={() => handleSavePack(pack.id)}
            >
              {pack.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
        <div>
          <Label htmlFor="cooling-toggle">Show cooling down</Label>
          <p className="text-xs text-muted-foreground">
            Display when a ranked friend is drifting out of your top 8.
          </p>
        </div>
        <Switch
          id="cooling-toggle"
          checked={showCooling}
          disabled={saving}
          onCheckedChange={handleToggleCooling}
        />
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <ul className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
          {EDITABLE_STATES.map((state) => (
            <li key={state} className="flex items-center justify-between gap-2">
              <span>{RELATIONSHIP_STATE_LABELS[state]}</span>
              <span className="text-lg" aria-hidden>
                {prefs?.states?.[state] || DEFAULT_RELATIONSHIP_EMOJIS[state]}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2">
            <span>Active streak</span>
            <span>{DEFAULT_STREAK_EMOJIS.active} 42</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
