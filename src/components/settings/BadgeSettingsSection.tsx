import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, Crown, Shield, BadgeCheck, Heart, ChevronRight } from 'lucide-react';
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
import { useUserBadges } from '@/hooks/useBadges';
import { BadgeRow } from '@/components/badges';

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
  const { data: userBadges } = useUserBadges(profile?.id);
  
  // Determine which badges the user has
  const hasOwnerBadge = isOwner(profile?.username);
  const hasOwnerWifeBadge = isOwnerWife(profile?.id);
  const hasModBadge = !!userRole;
  const hasVerifiedBadge = profile?.is_verified;
  const hasEarnedBadges = (userBadges?.length || 0) > 0;
  
  // Transform user badges for display
  const displayBadges = userBadges?.slice(0, 5).map(ub => ({
    id: ub.badge.id,
    icon: ub.badge.icon,
    name: ub.badge.name,
    description: ub.badge.description,
    gradient_from: ub.badge.gradient_from,
    gradient_to: ub.badge.gradient_to,
    effect: ub.badge.effect,
    is_animated: ub.badge.is_animated,
  })) || [];
  
  // Check if user has any badges at all
  const hasAnyBadge = hasOwnerBadge || hasOwnerWifeBadge || hasModBadge || hasVerifiedBadge || hasEarnedBadges;

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
        <h3 className="font-semibold text-base text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Badge Display</h3>
      </div>
      
      <p className="text-sm text-foreground/80 mb-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        Choose which badges are visible on your profile
      </p>

      <div className="space-y-4">
        {/* Badge Library Link */}
        <Link to="/badges" className="block">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Award className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="font-medium">Badge Library</span>
                <p className="text-xs text-muted-foreground">View all badges & challenges</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {displayBadges.length > 0 && <BadgeRow badges={displayBadges} maxVisible={3} size="xs" />}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Link>
        
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
