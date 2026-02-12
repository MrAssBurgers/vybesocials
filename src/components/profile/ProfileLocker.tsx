import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Sparkles, ShoppingBag, Lock, Check, Crown, Shield, Heart, BadgeCheck, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { useUserBadges, useAllBadges, Badge } from '@/hooks/useBadges';
import { useUserBackgrounds, useSetActiveBackground, useClearActiveBackground, UserBackground } from '@/hooks/useUserBackgrounds';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isOwner } from '@/components/ui/OwnerBadge';
import { isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { BadgeRow } from '@/components/badges';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

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

export function ProfileLocker() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('badges');
  const [savingBadges, setSavingBadges] = useState(false);
  
  // Badge data
  const { data: userBadges = [] } = useUserBadges(profile?.id);
  const { data: allBadges = [] } = useAllBadges();
  const { data: userRole } = useUserRoleById(profile?.id);
  
  // Background data
  const { data: userBackgrounds = [] } = useUserBackgrounds();
  const setActiveBackground = useSetActiveBackground();
  const clearActiveBackground = useClearActiveBackground();
  
  // Badge visibility settings
  const [settings, setSettings] = useState<BadgeSettings>(() => {
    const saved = profile?.badge_settings as unknown as BadgeSettings;
    return saved ? { ...defaultSettings, ...saved } : defaultSettings;
  });
  
  const hasOwnerBadge = isOwner(profile?.username);
  const hasOwnerWifeBadge = isOwnerWife(profile?.id);
  const hasModBadge = !!userRole;
  const hasVerifiedBadge = profile?.is_verified;
  
  // Earned badges
  const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge_id));
  
  // Separate earned vs locked
  const earnedBadges = userBadges.map(ub => ub.badge);
  const lockedBadges = allBadges.filter(b => !earnedBadgeIds.has(b.id) && !b.is_staff_badge);

  const handleToggle = (key: keyof BadgeSettings) => {
    haptics.select();
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveBadgeSettings = async () => {
    if (!profile?.id) return;
    setSavingBadges(true);
    haptics.select();
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ badge_settings: settings as unknown as Record<string, boolean> })
        .eq('id', profile.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      haptics.success();
      toast.success('Badge settings saved! ✨');
    } catch {
      haptics.error();
      toast.error('Failed to save settings');
    } finally {
      setSavingBadges(false);
    }
  };

  const handleSetBackground = async (bg: UserBackground) => {
    try {
      haptics.select();
      await setActiveBackground.mutateAsync(bg.id);
      toast.success('Background equipped! 🎨');
    } catch {
      toast.error('Failed to set background');
    }
  };

  const handleClearBackground = async () => {
    try {
      haptics.select();
      await clearActiveBackground.mutateAsync();
      toast.success('Background removed');
    } catch {
      toast.error('Failed to clear background');
    }
  };

  const activeBackground = userBackgrounds.find(bg => bg.is_active);

  return (
    <div className="space-y-4">
      {/* Locker Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-3"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary/20 via-accent/15 to-primary/20 border border-primary/30">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Your Locker</span>
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
      </motion.div>

      {/* Section Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="w-full">
          <TabsTrigger value="badges" className="flex-1 gap-1.5">
            <Award className="w-3.5 h-3.5" />
            Badges
          </TabsTrigger>
          <TabsTrigger value="backgrounds" className="flex-1 gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Themes
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex-1 gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            Shop
        </TabsTrigger>
        </TabsList>

        {/* BADGES TAB */}
        <TabsContent value="badges">
          <div className="space-y-4">
            {/* Equipped Badges */}
            {earnedBadges.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="liquid-glass-card p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Your Badges
                  </h4>
                  <Link to="/badges" className="text-xs text-primary hover:underline flex items-center gap-1">
                    View All <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {earnedBadges.map((badge, i) => (
                    <motion.div
                      key={badge.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex flex-col items-center gap-1.5 group cursor-pointer"
                    >
                      <div className="relative">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                          "bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/25",
                          "group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-200"
                        )}>
                          {badge.icon}
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                        {badge.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Badge Visibility Toggles */}
            {(hasOwnerBadge || hasOwnerWifeBadge || hasModBadge || hasVerifiedBadge) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="liquid-glass-card p-4"
              >
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  Badge Visibility
                </h4>
                <p className="text-xs text-muted-foreground mb-3">Toggle which badges show on your profile</p>
                
                <div className="space-y-2">
                  {hasOwnerBadge && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2.5">
                        <Crown className="w-4 h-4 text-primary" />
                        <Label className="text-sm">Owner</Label>
                      </div>
                      <Switch checked={settings.show_owner_badge} onCheckedChange={() => handleToggle('show_owner_badge')} />
                    </div>
                  )}
                  {hasOwnerWifeBadge && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2.5">
                        <Heart className="w-4 h-4 text-[hsl(var(--neon-pink))]" />
                        <Label className="text-sm">Owner's Wife</Label>
                      </div>
                      <Switch checked={settings.show_owner_wife_badge} onCheckedChange={() => handleToggle('show_owner_wife_badge')} />
                    </div>
                  )}
                  {hasModBadge && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2.5">
                        <Shield className="w-4 h-4 text-accent" />
                        <Label className="text-sm">Moderator</Label>
                      </div>
                      <Switch checked={settings.show_mod_badge} onCheckedChange={() => handleToggle('show_mod_badge')} />
                    </div>
                  )}
                  {hasVerifiedBadge && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2.5">
                        <BadgeCheck className="w-4 h-4 text-green-500" />
                        <Label className="text-sm">Verified</Label>
                      </div>
                      <Switch checked={settings.show_verified_badge} onCheckedChange={() => handleToggle('show_verified_badge')} />
                    </div>
                  )}
                </div>
                
                <Button onClick={handleSaveBadgeSettings} disabled={savingBadges} className="w-full mt-3" size="sm">
                  {savingBadges ? 'Saving...' : 'Save Settings'}
                </Button>
              </motion.div>
            )}

            {/* Locked Badges Preview */}
            {lockedBadges.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="liquid-glass-card p-4"
              >
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Locked Badges
                </h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {lockedBadges.slice(0, 12).map((badge, i) => (
                    <motion.div
                      key={badge.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.03 }}
                      className="flex flex-col items-center gap-1.5 opacity-50"
                    >
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-secondary/50 border border-border/30 grayscale">
                          {badge.icon}
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                          <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                        {badge.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
                {lockedBadges.length > 12 && (
                  <Link to="/badges" className="block mt-3">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      View All {lockedBadges.length} Badges
                    </Button>
                  </Link>
                )}
              </motion.div>
            )}

            {earnedBadges.length === 0 && lockedBadges.length === 0 && (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">🏆</p>
                <p className="text-muted-foreground text-sm">Complete challenges to earn badges!</p>
                <Link to="/challenges">
                  <Button variant="gradient" size="sm" className="mt-3">
                    View Challenges
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </TabsContent>

        {/* BACKGROUNDS/THEMES TAB */}
        <TabsContent value="backgrounds">
          <div className="space-y-4">
            {userBackgrounds.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="liquid-glass-card p-4"
              >
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Your Themes
                </h4>

                {/* Active background indicator */}
                {activeBackground && (
                  <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-500 font-medium">
                        Active: {activeBackground.name || 'Custom Background'}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleClearBackground}>
                      Remove
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {userBackgrounds.map((bg, i) => (
                    <motion.button
                      key={bg.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => handleSetBackground(bg)}
                      className={cn(
                        "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                        bg.is_active 
                          ? "border-primary shadow-lg shadow-primary/20" 
                          : "border-border/30 hover:border-primary/50"
                      )}
                    >
                      <img src={bg.image_url} alt={bg.name || 'Background'} className="w-full h-full object-cover" />
                      {bg.is_active && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <span className="text-[10px] text-white font-medium truncate block">
                          {bg.name || 'Custom'}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">🎨</p>
                <p className="text-muted-foreground text-sm">No themes yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload backgrounds in Settings → Appearance
                </p>
                <Link to="/settings">
                  <Button variant="outline" size="sm" className="mt-3">
                    Go to Settings
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </TabsContent>

        {/* SHOP TAB - Coming Soon */}
        <TabsContent value="shop">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="liquid-glass-card p-6"
          >
            <div className="text-center py-8">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="inline-block text-5xl mb-4"
              >
                🛍️
              </motion.div>
              <h3 className="text-lg font-bold text-foreground mb-2">Profile Shop</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                Exclusive cosmetics, themes, and profile effects are on the way!
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-sm font-semibold text-foreground">Coming Soon</span>
              </div>
              
              {/* Teaser items */}
              <div className="grid grid-cols-3 gap-3 mt-6">
                {[
                  { icon: '✨', label: 'Name Effects' },
                  { icon: '🎭', label: 'Profile Frames' },
                  { icon: '🌈', label: 'Color Themes' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.5, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border/20"
                  >
                    <span className="text-2xl grayscale">{item.icon}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
