import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ShoppingBag, Lock, Check, Crown, Shield, Heart, BadgeCheck, ChevronDown, Type, Wand2, Diamond, Zap, Palette, Layers, Package } from 'lucide-react';
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

// ── Name color map ──────────────────────────────────────────────
const NAME_COLOR_MAP: Record<string, string> = {
  'Crimson': '#DC2626',
  'Ocean Blue': '#2563EB',
  'Emerald': '#059669',
  'Sunset Orange': '#EA580C',
  'Neon Pink': '#EC4899',
  'Ice Blue': '#06B6D4',
  'Royal Purple': '#7C3AED',
  'Toxic Green': '#84CC16',
  'Gold': '#EAB308',
  'Diamond White': '#E2E8F0',
  'Holographic': 'linear-gradient(90deg, #EC4899, #8B5CF6, #06B6D4, #10B981, #EAB308)',
};

// ── Profile theme preview colors ────────────────────────────────
const THEME_PREVIEW: Record<string, { from: string; to: string }> = {
  'Midnight': { from: '#1e1b4b', to: '#312e81' },
  'Sunset Vibes': { from: '#9a3412', to: '#dc2626' },
  'Arctic': { from: '#164e63', to: '#0e7490' },
  'Neon City': { from: '#701a75', to: '#be185d' },
  'Inferno': { from: '#7c2d12', to: '#dc2626' },
  'Galaxy': { from: '#1e1b4b', to: '#6d28d9' },
  'Aurora Borealis': { from: '#064e3b', to: '#6d28d9' },
  'Void': { from: '#0a0a0a', to: '#1c1917' },
};

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

// ── Animated Section ────────────────────────────────────────────
function LockerSection({ icon: Icon, title, count, defaultOpen = true, children }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <button
        onClick={() => { haptics.select(); setOpen(!open); }}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/40 hover:border-primary/30 transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold tabular-nums">{count}</span>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Cosmetic Item Card ──────────────────────────────────────────
function CosmeticCard({ item, isEquipped, onToggle, delay = 0 }: {
  item: LockerItem;
  isEquipped: boolean;
  onToggle: () => void;
  delay?: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={item.unlocked ? { scale: 1.08, y: -2 } : undefined}
      whileTap={item.unlocked ? { scale: 0.92 } : undefined}
      onClick={item.unlocked ? onToggle : undefined}
      className={cn(
        "relative flex flex-col items-center gap-2 p-3.5 rounded-2xl border-2 transition-all duration-300",
        item.unlocked
          ? isEquipped
            ? "bg-primary/8 border-primary/60 shadow-lg shadow-primary/10"
            : "bg-card/50 border-transparent hover:border-primary/30 hover:shadow-md cursor-pointer"
          : "bg-muted/30 border-transparent opacity-40 cursor-not-allowed"
      )}
    >
      {isEquipped && (
        <motion.div
          layoutId={`equip-ring-${item.id}`}
          className="absolute inset-0 rounded-2xl border-2 border-primary/40"
          initial={false}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      )}
      <div className="relative">
        <motion.span
          className={cn("text-3xl block", !item.unlocked && "grayscale")}
          animate={isEquipped ? { scale: [1, 1.15, 1] } : {}}
          transition={isEquipped ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : {}}
        >
          {item.reward_icon}
        </motion.span>
        <AnimatePresence>
          {isEquipped && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-2 w-5 h-5 rounded-full bg-green-500 shadow-md shadow-green-500/30 flex items-center justify-center"
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
        {!item.unlocked && (
          <div className="absolute -top-1 -right-2 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="text-center space-y-0.5">
        <span className="text-[11px] font-semibold text-foreground leading-tight block">{item.reward_name}</span>
        <span className="text-[9px] text-muted-foreground font-medium">Level {item.level}</span>
      </div>
    </motion.button>
  );
}

// ── Name Color Card ─────────────────────────────────────────────
function NameColorCard({ item, isEquipped, onToggle, delay = 0 }: {
  item: LockerItem;
  isEquipped: boolean;
  onToggle: () => void;
  delay?: number;
}) {
  const color = NAME_COLOR_MAP[item.reward_name];
  const isGradient = color?.startsWith('linear');

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={item.unlocked ? { scale: 1.08, y: -2 } : undefined}
      whileTap={item.unlocked ? { scale: 0.92 } : undefined}
      onClick={item.unlocked ? onToggle : undefined}
      className={cn(
        "relative flex flex-col items-center gap-2 p-3.5 rounded-2xl border-2 transition-all duration-300",
        item.unlocked
          ? isEquipped
            ? "bg-primary/8 border-primary/60 shadow-lg shadow-primary/10"
            : "bg-card/50 border-transparent hover:border-primary/30 hover:shadow-md cursor-pointer"
          : "bg-muted/30 border-transparent opacity-40 cursor-not-allowed"
      )}
    >
      {isEquipped && (
        <motion.div className="absolute inset-0 rounded-2xl border-2 border-primary/40" />
      )}
      <div className="relative">
        {/* Color swatch */}
        <div
          className={cn("w-10 h-10 rounded-full border-2 border-background shadow-md", !item.unlocked && "grayscale opacity-50")}
          style={{
            background: isGradient ? color : color || '#888',
          }}
        />
        <AnimatePresence>
          {isEquipped && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 shadow-md shadow-green-500/30 flex items-center justify-center"
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
        {!item.unlocked && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center">
            <Lock className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="text-center space-y-0.5">
        <span
          className="text-[11px] font-bold leading-tight block"
          style={!isGradient ? { color: item.unlocked ? color : undefined } : {
            background: color,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {item.reward_name}
        </span>
        <span className="text-[9px] text-muted-foreground font-medium">Level {item.level}</span>
      </div>
    </motion.button>
  );
}

// ── Profile Theme Card ──────────────────────────────────────────
function ThemeCard({ item, isEquipped, onToggle, delay = 0 }: {
  item: LockerItem;
  isEquipped: boolean;
  onToggle: () => void;
  delay?: number;
}) {
  const preview = THEME_PREVIEW[item.reward_name];

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={item.unlocked ? { scale: 1.05, y: -2 } : undefined}
      whileTap={item.unlocked ? { scale: 0.95 } : undefined}
      onClick={item.unlocked ? onToggle : undefined}
      className={cn(
        "relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-300",
        item.unlocked
          ? isEquipped
            ? "border-primary/60 shadow-lg shadow-primary/10"
            : "border-transparent hover:border-primary/30 hover:shadow-md cursor-pointer"
          : "border-transparent opacity-40 cursor-not-allowed"
      )}
    >
      {isEquipped && (
        <motion.div className="absolute inset-0 rounded-2xl border-2 border-primary/40" />
      )}
      {/* Theme preview mini card */}
      <div
        className={cn("w-full h-14 rounded-xl relative overflow-hidden", !item.unlocked && "grayscale opacity-50")}
        style={{
          background: preview
            ? `linear-gradient(135deg, ${preview.from}, ${preview.to})`
            : 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))',
        }}
      >
        {/* Mini avatar placeholder */}
        <div className="absolute bottom-1.5 left-2 w-5 h-5 rounded-full bg-white/20 border border-white/30" />
        <div className="absolute bottom-2 left-9 w-12 h-1.5 rounded-full bg-white/20" />
        <div className="absolute bottom-2 right-2 w-6 h-1.5 rounded-full bg-white/15" />
      </div>
      <AnimatePresence>
        {isEquipped && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 shadow-md shadow-green-500/30 flex items-center justify-center"
          >
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
      {!item.unlocked && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center">
          <Lock className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )}
      <div className="text-center space-y-0.5">
        <span className="text-[11px] font-semibold text-foreground leading-tight block">{item.reward_name}</span>
        <span className="text-[9px] text-muted-foreground font-medium">Level {item.level}</span>
      </div>
    </motion.button>
  );
}

// ── Main Locker ─────────────────────────────────────────────────
export function ProfileLocker() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [savingBadges, setSavingBadges] = useState(false);

  const { data: userBadges = [] } = useUserBadges(profile?.id);
  const { data: allBadges = [] } = useAllBadges();
  const { data: userRole } = useUserRoleById(profile?.id);
  const { data: lockerData } = useLockerItems();
  const equipItem = useEquipItem();

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
      toast.success('Settings saved ✨');
    } catch {
      haptics.error();
      toast.error('Failed to save');
    } finally {
      setSavingBadges(false);
    }
  };

  const handleEquip = (type: 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme', item: LockerItem) => {
    if (!item.unlocked || equipItem.isPending) return;
    haptics.select();

    const equippedMap: Record<string, string | null | undefined> = {
      title: lockerData?.equippedTitle,
      effect: lockerData?.equippedEffect,
      frame: lockerData?.equippedFrame,
      name_color: lockerData?.equippedNameColor,
      profile_theme: lockerData?.equippedProfileTheme,
    };

    const currentlyEquipped = equippedMap[type];
    const newValue = currentlyEquipped === item.reward_name ? null : item.reward_name;

    equipItem.mutate(
      { type, value: newValue },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(newValue ? `${item.reward_name} equipped!` : `Unequipped`);
        },
        onError: () => {
          haptics.error();
          toast.error('Failed to update');
        },
      }
    );
  };

  const equippedCount = [
    lockerData?.equippedTitle,
    lockerData?.equippedEffect,
    lockerData?.equippedFrame,
    lockerData?.equippedNameColor,
    lockerData?.equippedProfileTheme,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3 pb-4">
      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="text-center py-3"
      >
        <motion.div
          className="inline-flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/20 shadow-sm"
          whileHover={{ scale: 1.02 }}
        >
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground tracking-tight">Your Locker</span>
          {equippedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 font-bold">{equippedCount} active</span>
          )}
        </motion.div>
        {lockerData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-1.5 mt-2"
          >
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Level {lockerData.userLevel}</span>
          </motion.div>
        )}
      </motion.div>

      {/* ── Badges ──────────────────────────────────────────── */}
      <LockerSection icon={Award} title="Badges" count={earnedBadges.length}>
        <div className="space-y-2.5">
          {earnedBadges.length > 0 && (
            <div className="rounded-2xl bg-card/40 p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Earned</span>
                <Link to="/badges" className="text-[10px] text-primary font-semibold hover:underline">View All →</Link>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                {earnedBadges.map((badge, i) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 400 }}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-center text-lg group-hover:scale-110 group-hover:shadow-md group-hover:shadow-primary/15 transition-all duration-200">
                        {badge.icon}
                      </div>
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                        <Check className="w-1.5 h-1.5 text-white" strokeWidth={3} />
                      </div>
                    </div>
                    <span className="text-[8px] text-muted-foreground text-center truncate w-full leading-tight">{badge.name}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {(hasOwnerBadge || hasOwnerWifeBadge || hasModBadge || hasVerifiedBadge) && (
            <div className="rounded-2xl bg-card/40 p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visibility</span>
              {hasOwnerBadge && (
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-primary" /><Label className="text-xs font-medium">Owner</Label></div>
                  <Switch checked={settings.show_owner_badge} onCheckedChange={() => handleToggle('show_owner_badge')} />
                </div>
              )}
              {hasOwnerWifeBadge && (
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-[hsl(var(--neon-pink))]" /><Label className="text-xs font-medium">Owner's Wife</Label></div>
                  <Switch checked={settings.show_owner_wife_badge} onCheckedChange={() => handleToggle('show_owner_wife_badge')} />
                </div>
              )}
              {hasModBadge && (
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-accent" /><Label className="text-xs font-medium">Moderator</Label></div>
                  <Switch checked={settings.show_mod_badge} onCheckedChange={() => handleToggle('show_mod_badge')} />
                </div>
              )}
              {hasVerifiedBadge && (
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2"><BadgeCheck className="w-3.5 h-3.5 text-green-500" /><Label className="text-xs font-medium">Verified</Label></div>
                  <Switch checked={settings.show_verified_badge} onCheckedChange={() => handleToggle('show_verified_badge')} />
                </div>
              )}
              <Button onClick={handleSaveBadgeSettings} disabled={savingBadges} className="w-full mt-1" size="sm" variant="secondary">
                {savingBadges ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}

          {lockedBadges.length > 0 && (
            <div className="rounded-2xl bg-card/40 p-3">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1 mb-2.5">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
              <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                {lockedBadges.slice(0, 14).map((badge, i) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/20 flex items-center justify-center text-lg grayscale">{badge.icon}</div>
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-muted flex items-center justify-center">
                        <Lock className="w-1.5 h-1.5 text-muted-foreground" />
                      </div>
                    </div>
                    <span className="text-[8px] text-muted-foreground text-center truncate w-full">{badge.name}</span>
                  </motion.div>
                ))}
              </div>
              {lockedBadges.length > 14 && (
                <Link to="/badges" className="block mt-2.5">
                  <Button variant="outline" size="sm" className="w-full text-[10px] h-7 rounded-xl">
                    View All {lockedBadges.length} Badges
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </LockerSection>

      {/* ── Name Colors ─────────────────────────────────────── */}
      <LockerSection icon={Palette} title="Name Colors" count={lockerData?.name_colors.filter(t => t.unlocked).length}>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {lockerData?.name_colors.map((item, i) => (
            <NameColorCard
              key={item.id}
              item={item}
              isEquipped={lockerData.equippedNameColor === item.reward_name}
              onToggle={() => handleEquip('name_color', item)}
              delay={i * 0.05}
            />
          ))}
        </div>
      </LockerSection>

      {/* ── Titles ──────────────────────────────────────────── */}
      <LockerSection icon={Type} title="Titles" count={lockerData?.titles.filter(t => t.unlocked).length}>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {lockerData?.titles.map((item, i) => (
            <CosmeticCard
              key={item.id}
              item={item}
              isEquipped={lockerData.equippedTitle === item.reward_name}
              onToggle={() => handleEquip('title', item)}
              delay={i * 0.05}
            />
          ))}
        </div>
      </LockerSection>

      {/* ── Profile Effects ─────────────────────────────────── */}
      <LockerSection icon={Wand2} title="Profile Effects" count={lockerData?.effects.filter(t => t.unlocked).length}>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {lockerData?.effects.map((item, i) => (
            <CosmeticCard
              key={item.id}
              item={item}
              isEquipped={lockerData.equippedEffect === item.reward_name}
              onToggle={() => handleEquip('effect', item)}
              delay={i * 0.05}
            />
          ))}
        </div>
      </LockerSection>

      {/* ── Avatar Frames ───────────────────────────────────── */}
      <LockerSection icon={Diamond} title="Avatar Frames" count={lockerData?.cosmetics.filter(t => t.unlocked).length}>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {lockerData?.cosmetics.map((item, i) => (
            <CosmeticCard
              key={item.id}
              item={item}
              isEquipped={lockerData.equippedFrame === item.reward_name}
              onToggle={() => handleEquip('frame', item)}
              delay={i * 0.05}
            />
          ))}
        </div>
      </LockerSection>

      {/* ── Profile Themes ──────────────────────────────────── */}
      <LockerSection icon={Layers} title="Profile Themes" count={lockerData?.profile_themes.filter(t => t.unlocked).length}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {lockerData?.profile_themes.map((item, i) => (
            <ThemeCard
              key={item.id}
              item={item}
              isEquipped={lockerData.equippedProfileTheme === item.reward_name}
              onToggle={() => handleEquip('profile_theme', item)}
              delay={i * 0.05}
            />
          ))}
        </div>
      </LockerSection>

      {/* ── Shop ────────────────────────────────────────────── */}
      <LockerSection icon={ShoppingBag} title="Shop" defaultOpen={false}>
        <motion.div
          className="rounded-2xl bg-card/40 p-5 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.span
            className="inline-block text-5xl mb-3"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            🛍️
          </motion.span>
          <h3 className="text-base font-bold text-foreground mb-1">Profile Shop</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-[200px] mx-auto leading-relaxed">
            Exclusive cosmetics and profile upgrades are on the way
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <Package className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-xs font-bold text-foreground">Coming Soon</span>
          </div>
        </motion.div>
      </LockerSection>
    </div>
  );
}
