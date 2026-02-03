import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Award, Crown, Shield, BadgeCheck, Heart } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isOwner } from '@/components/ui/OwnerBadge';
import { isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useQueryClient } from '@tanstack/react-query';

interface BadgeSettings {
  show_owner_badge: boolean;
  show_mod_badge: boolean;
  show_verified_badge: boolean;
  show_owner_wife_badge: boolean;
}

const defaultSettings: BadgeSettings = {
  show_owner_badge: true,
  show_mod_badge: true,
  show_verified_badge: true,
  show_owner_wife_badge: true,
};

export function BadgeSettingsSection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<BadgeSettings>(defaultSettings);
  const { data: userRole } = useUserRoleById(profile?.id);
  
  // Determine which badges the user has
  const hasOwnerBadge = isOwner(profile?.username);
  const hasOwnerWifeBadge = isOwnerWife(profile?.id);
  const hasModBadge = !!userRole;
  const hasVerifiedBadge = profile?.is_verified;
  
  // Check if user has any badges at all
  const hasAnyBadge = hasOwnerBadge || hasOwnerWifeBadge || hasModBadge || hasVerifiedBadge;

  useEffect(() => {
    if (profile?.badge_settings) {
      const savedSettings = profile.badge_settings as unknown as BadgeSettings;
      setSettings({ ...defaultSettings, ...savedSettings });
    }
  }, [profile?.badge_settings]);

  const handleToggle = (key: keyof BadgeSettings) => {
    haptics.select();
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!profile?.id) return;
    
    setLoading(true);
    haptics.select();
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ badge_settings: settings as unknown as Record<string, boolean> })
        .eq('id', profile.id);
        
      if (error) throw error;
      
      // Invalidate profile queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      
      haptics.success();
      toast.success('Badge settings saved!');
    } catch (error: unknown) {
      haptics.error();
      toast.error('Failed to save badge settings');
      if (import.meta.env.DEV) console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show this section if user has no badges
  if (!hasAnyBadge) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-6">
        <Award className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-base">Badge Display</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-6">
        Choose which badges are visible on your profile
      </p>

      <div className="space-y-4">
        {/* Owner Badge */}
        {hasOwnerBadge && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Crown className="w-4 h-4 text-primary" />
              </div>
              <div>
                <Label className="font-medium">Owner Badge</Label>
                <p className="text-xs text-muted-foreground">Shows you're the app owner</p>
              </div>
            </div>
            <Switch
              checked={settings.show_owner_badge}
              onCheckedChange={() => handleToggle('show_owner_badge')}
            />
          </div>
        )}
        
        {/* Owner's Wife Badge */}
        {hasOwnerWifeBadge && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--neon-pink))]/20 flex items-center justify-center">
                <Heart className="w-4 h-4 text-[hsl(var(--neon-pink))]" />
              </div>
              <div>
                <Label className="font-medium">Owner's Wife Badge</Label>
                <p className="text-xs text-muted-foreground">Shows your special status 💍</p>
              </div>
            </div>
            <Switch
              checked={settings.show_owner_wife_badge}
              onCheckedChange={() => handleToggle('show_owner_wife_badge')}
            />
          </div>
        )}

        {/* Moderator Badge */}
        {hasModBadge && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-accent" />
              </div>
              <div>
                <Label className="font-medium">Moderator Badge</Label>
                <p className="text-xs text-muted-foreground">Shows your {userRole} role</p>
              </div>
            </div>
            <Switch
              checked={settings.show_mod_badge}
              onCheckedChange={() => handleToggle('show_mod_badge')}
            />
          </div>
        )}

        {/* Verified Badge */}
        {hasVerifiedBadge && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <BadgeCheck className="w-4 h-4 text-success" />
              </div>
              <div>
                <Label className="font-medium">Verified Badge</Label>
                <p className="text-xs text-muted-foreground">Shows you're verified</p>
              </div>
            </div>
            <Switch
              checked={settings.show_verified_badge}
              onCheckedChange={() => handleToggle('show_verified_badge')}
            />
          </div>
        )}

        <Button 
          onClick={handleSave} 
          disabled={loading}
          className="w-full mt-4"
        >
          {loading ? 'Saving...' : 'Save Badge Settings'}
        </Button>
      </div>
    </motion.div>
  );
}
