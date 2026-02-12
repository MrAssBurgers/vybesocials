import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Sparkles, ShoppingBag, Lock, Check, Crown, Shield, Heart, BadgeCheck, ChevronDown, ChevronRight, Star, Flame, Diamond, Palette, Type, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { useUserBadges, useAllBadges } from '@/hooks/useBadges';
import { useLockerItems, useEquipItem, LockerItem } from '@/hooks/useLockerItems';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isOwner } from '@/components/ui/OwnerBadge';
import { isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

// ── Section Header ──────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, count, isOpen, onToggle }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border/30 hover:bg-secondary/60 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{count}</span>
        )}
      </div>
      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

// ── Cosmetic Item Card ──────────────────────────────────────────
function CosmeticCard({ item, isEquipped, onToggle }: {
  item: LockerItem;
  isEquipped: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      whileHover={item.unlocked ? { scale: 1.05 } : undefined}
      whileTap={item.unlocked ? { scale: 0.95 } : undefined}
      onClick={item.unlocked ? onToggle : undefined}
      className={cn(
        "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all relative",
        item.unlocked
          ? isEquipped
            ? "bg-primary/10 border-primary shadow-md shadow-primary/15"
            : "bg-secondary/30 border-border/30 hover:border-primary/40 cursor-pointer"
          : "bg-secondary/20 border-border/20 opacity-50 cursor-not-allowed"
      )}
    >
      <div className="relative">
        <span className={cn("text-2xl", !item.unlocked && "grayscale")}>{item.reward_icon}</span>
        {isEquipped && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {!item.unlocked && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium text-foreground text-center leading-tight">{item.reward_name}</span>
      <span className="text-[9px] text-muted-foreground">Lv.{item.level}</span>
    </motion.button>
  );
}

// ── Main Locker Component ───────────────────────────────────────
export function ProfileLocker() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [savingBadges, setSavingBadges] = useState(false);
  
  // Section open states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    badges: true,
    titles: true,
    effects: true,
    cosmetics: true,
    shop: false,
  });

  const toggleSection = (key: string) => {
    haptics.select();
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Data hooks
  const { data: userBadges = [] } = useUserBadges(profile?.id);
  const { data: allBadges = [] } = useAllBadges();
  const { data: userRole } = useUserRoleById(profile?.id);
  const { data: lockerData } = useLockerItems();
  const equipItem = useEquipItem();
  
  // Badge settings
  const [settings, setSettings] = useState<BadgeSettings>(() => {
    const saved = profile?.badge_settings as unknown as BadgeSettings;
    return saved ? { ...defaultSettings, ...saved } : defaultSettings;
  });
  
  const hasOwnerBadge = isOwner(profile?.username);
  const hasOwnerWifeBadge = isOwnerWife(profile?.id);
  const hasModBadge = !!userRole;
  const hasVerifiedBadge = profile?.is_verified;
  
  const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge_id));
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

  const handleEquip = (type: 'title' | 'effect' | 'frame', item: LockerItem) => {
    if (!item.unlocked) return;
    haptics.select();

    const currentlyEquipped = type === 'title' ? lockerData?.equippedTitle
      : type === 'effect' ? lockerData?.equippedEffect
      : lockerData?.equippedFrame;

    const newValue = currentlyEquipped === item.reward_name ? null : item.reward_name;

    equipItem.mutate(
      { type, value: newValue },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(newValue ? `${item.reward_name} equipped! ✨` : `${item.reward_name} unequipped`);
        },
        onError: () => {
          haptics.error();
          toast.error('Failed to update');
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      {/* Locker Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-2"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary/20 via-accent/15 to-primary/20 border border-primary/30">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Your Locker</span>
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        {lockerData && (
          <p className="text-xs text-muted-foreground mt-1.5">Level {lockerData.userLevel}</p>
        )}
      </motion.div>

      {/* ═══ BADGES SECTION ═══ */}
      <Collapsible open={openSections.badges} onOpenChange={() => toggleSection('badges')}>
        <CollapsibleTrigger asChild>
          <div><SectionHeader icon={Award} title="Badges" count={earnedBadges.length} isOpen={openSections.badges} onToggle={() => {}} /></div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 space-y-3">
            {/* Earned badges */}
            {earnedBadges.length > 0 && (
              <div className="liquid-glass-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earned</h4>
                  <Link to="/badges" className="text-xs text-primary hover:underline">View All</Link>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {earnedBadges.map((badge, i) => (
                    <motion.div
                      key={badge.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex flex-col items-center gap-1 group cursor-pointer"
                    >
                      <div className="relative">
                        <div className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center text-xl",
                          "bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/25",
                          "group-hover:scale-110 group-hover:shadow-lg transition-all duration-200"
                        )}>
                          {badge.icon}
                        </div>
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                          <Check className="w-2 h-2 text-white" />
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground text-center truncate w-full">{badge.name}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Badge visibility toggles */}
            {(hasOwnerBadge || hasOwnerWifeBadge || hasModBadge || hasVerifiedBadge) && (
              <div className="liquid-glass-card p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visibility</h4>
                <div className="space-y-1.5">
                  {hasOwnerBadge && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-primary" /><Label className="text-xs">Owner</Label></div>
                      <Switch checked={settings.show_owner_badge} onCheckedChange={() => handleToggle('show_owner_badge')} />
                    </div>
                  )}
                  {hasOwnerWifeBadge && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-[hsl(var(--neon-pink))]" /><Label className="text-xs">Owner's Wife</Label></div>
                      <Switch checked={settings.show_owner_wife_badge} onCheckedChange={() => handleToggle('show_owner_wife_badge')} />
                    </div>
                  )}
                  {hasModBadge && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-accent" /><Label className="text-xs">Moderator</Label></div>
                      <Switch checked={settings.show_mod_badge} onCheckedChange={() => handleToggle('show_mod_badge')} />
                    </div>
                  )}
                  {hasVerifiedBadge && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2"><BadgeCheck className="w-3.5 h-3.5 text-green-500" /><Label className="text-xs">Verified</Label></div>
                      <Switch checked={settings.show_verified_badge} onCheckedChange={() => handleToggle('show_verified_badge')} />
                    </div>
                  )}
                </div>
                <Button onClick={handleSaveBadgeSettings} disabled={savingBadges} className="w-full mt-2" size="sm">
                  {savingBadges ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            )}

            {/* Locked badges */}
            {lockedBadges.length > 0 && (
              <div className="liquid-glass-card p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Locked
                </h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {lockedBadges.slice(0, 12).map((badge, i) => (
                    <motion.div
                      key={badge.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="relative">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-secondary/50 border border-border/30 grayscale">{badge.icon}</div>
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center">
                          <Lock className="w-2 h-2 text-muted-foreground" />
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground text-center truncate w-full">{badge.name}</span>
                    </motion.div>
                  ))}
                </div>
                {lockedBadges.length > 12 && (
                  <Link to="/badges" className="block mt-2">
                    <Button variant="outline" size="sm" className="w-full text-xs">View All {lockedBadges.length} Badges</Button>
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══ TITLES SECTION ═══ */}
      <Collapsible open={openSections.titles} onOpenChange={() => toggleSection('titles')}>
        <CollapsibleTrigger asChild>
          <div><SectionHeader icon={Type} title="Titles" count={lockerData?.titles.filter(t => t.unlocked).length} isOpen={openSections.titles} onToggle={() => {}} /></div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {lockerData?.titles.map(item => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  isEquipped={lockerData.equippedTitle === item.reward_name}
                  onToggle={() => handleEquip('title', item)}
                />
              ))}
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══ EFFECTS SECTION ═══ */}
      <Collapsible open={openSections.effects} onOpenChange={() => toggleSection('effects')}>
        <CollapsibleTrigger asChild>
          <div><SectionHeader icon={Wand2} title="Profile Effects" count={lockerData?.effects.filter(t => t.unlocked).length} isOpen={openSections.effects} onToggle={() => {}} /></div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {lockerData?.effects.map(item => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  isEquipped={lockerData.equippedEffect === item.reward_name}
                  onToggle={() => handleEquip('effect', item)}
                />
              ))}
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══ COSMETICS SECTION ═══ */}
      <Collapsible open={openSections.cosmetics} onOpenChange={() => toggleSection('cosmetics')}>
        <CollapsibleTrigger asChild>
          <div><SectionHeader icon={Diamond} title="Cosmetics" count={lockerData?.cosmetics.filter(t => t.unlocked).length} isOpen={openSections.cosmetics} onToggle={() => {}} /></div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {lockerData?.cosmetics.map(item => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  isEquipped={lockerData.equippedFrame === item.reward_name}
                  onToggle={() => handleEquip('frame', item)}
                />
              ))}
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══ SHOP SECTION ═══ */}
      <Collapsible open={openSections.shop} onOpenChange={() => toggleSection('shop')}>
        <CollapsibleTrigger asChild>
          <div><SectionHeader icon={ShoppingBag} title="Shop" isOpen={openSections.shop} onToggle={() => {}} /></div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 liquid-glass-card p-4">
            <div className="text-center py-6">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="inline-block text-4xl mb-3"
              >
                🛍️
              </motion.div>
              <h3 className="text-base font-bold text-foreground mb-1">Profile Shop</h3>
              <p className="text-xs text-muted-foreground mb-3 max-w-xs mx-auto">
                Exclusive cosmetics, themes, and profile effects coming soon!
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span className="text-xs font-semibold text-foreground">Coming Soon</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { icon: '✨', label: 'Name Effects' },
                  { icon: '🎭', label: 'Profile Frames' },
                  { icon: '🌈', label: 'Color Themes' },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-secondary/30 border border-border/20 opacity-50">
                    <span className="text-xl grayscale">{item.icon}</span>
                    <span className="text-[9px] text-muted-foreground font-medium">{item.label}</span>
                    <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
