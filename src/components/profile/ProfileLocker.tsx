import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ShoppingBag, Lock, Check, Crown, Shield, Heart, BadgeCheck, Type, Wand2, Diamond, Zap, Palette, Layers, Package } from 'lucide-react';
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

// ── Constants ───────────────────────────────────────────────────
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

const TABS = [
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'frames', label: 'Frames', icon: Diamond },
  { id: 'themes', label: 'Themes', icon: Layers },
  { id: 'shop', label: 'Shop', icon: ShoppingBag },
] as const;

type TabId = typeof TABS[number]['id'];

// Map tab ids to equip types
const TAB_TO_EQUIP_TYPE: Record<string, 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme'> = {
  colors: 'name_color',
  titles: 'title',
  effects: 'effect',
  frames: 'frame',
  themes: 'profile_theme',
};

const TAB_TO_EQUIPPED_KEY: Record<string, keyof NonNullable<ReturnType<typeof useLockerItems>['data']>> = {
  colors: 'equippedNameColor',
  titles: 'equippedTitle',
  effects: 'equippedEffect',
  frames: 'equippedFrame',
  themes: 'equippedProfileTheme',
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

// ── Effect animation class map ──────────────────────────────────
const EFFECT_CLASS_MAP: Record<string, string> = {
  'Sparkle': 'sparkle-name',
  'Rainbow Shift': 'rainbow-name',
  'Fire Trail': 'fire-glow',
  'Cosmic Glow': 'cosmic-name',
  'Glitch': 'glitch-name',
  'Neon Pulse': 'neon-pulse-name',
  'Shadow Flicker': 'shadow-flicker-name',
  'Aurora Wave': 'aurora-wave-name',
  'Electric Surge': 'electric-surge-name',
  'Plasma Storm': 'plasma-storm-name',
};

// ── Frame style map ─────────────────────────────────────────────
const FRAME_STYLE_MAP: Record<string, { ring: string; shadow: string }> = {
  'Blue Glow': { ring: 'ring-2 ring-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.5)]' },
  'Fire Ring': { ring: 'ring-2 ring-orange-500', shadow: 'shadow-[0_0_8px_rgba(249,115,22,0.5)]' },
  'Diamond Frame': { ring: 'ring-2 ring-cyan-300', shadow: 'shadow-[0_0_8px_rgba(103,232,249,0.5)]' },
  'Neon Ring': { ring: 'ring-2 ring-pink-500', shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]' },
  'Emerald Ring': { ring: 'ring-2 ring-emerald-400', shadow: 'shadow-[0_0_8px_rgba(52,211,153,0.5)]' },
  'Sunset Halo': { ring: 'ring-2 ring-amber-400', shadow: 'shadow-[0_0_8px_rgba(251,191,36,0.5)]' },
  'Lightning Frame': { ring: 'ring-2 ring-yellow-300', shadow: 'shadow-[0_0_8px_rgba(253,224,71,0.5)]' },
  'Obsidian Frame': { ring: 'ring-2 ring-zinc-600', shadow: 'shadow-[0_0_8px_rgba(82,82,91,0.5)]' },
  'Holographic Frame': { ring: 'ring-2 ring-violet-400', shadow: 'shadow-[0_0_8px_rgba(167,139,250,0.5)]' },
};

// ── Item Card (generic) ─────────────────────────────────────────
function ItemCard({ item, isEquipped, isSelected, onSelect, tabId, displayName }: {
  item: LockerItem;
  isEquipped: boolean;
  isSelected: boolean;
  onSelect: () => void;
  tabId: TabId;
  displayName: string;
}) {
  const color = tabId === 'colors' ? NAME_COLOR_MAP[item.reward_name] : undefined;
  const isGradient = color?.startsWith('linear');
  const preview = tabId === 'themes' ? THEME_PREVIEW[item.reward_name] : undefined;
  const effectClass = tabId === 'effects' ? EFFECT_CLASS_MAP[item.reward_name] : undefined;
  const frameStyle = tabId === 'frames' ? FRAME_STYLE_MAP[item.reward_name] : undefined;

  return (
    <motion.button
      whileHover={item.unlocked ? { scale: 1.03, y: -2 } : undefined}
      whileTap={item.unlocked ? { scale: 0.97 } : undefined}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all duration-200",
        "backdrop-blur-xl bg-card/30",
        isSelected
          ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10"
          : item.unlocked
            ? "border-border/30 hover:border-primary/30 hover:bg-card/50"
            : "border-border/10 opacity-40 cursor-default"
      )}
    >
      {/* Frosted glass overlay */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] via-transparent to-foreground/[0.02]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      </div>

      {/* Equipped checkmark */}
      <AnimatePresence>
        {isEquipped && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 shadow-md shadow-green-500/30 flex items-center justify-center z-10"
          >
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lock icon */}
      {!item.unlocked && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center z-10">
          <Lock className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )}

      {/* ── Mini Profile Preview ──────────────────────────── */}
      <div className={cn(
        "w-full rounded-xl overflow-hidden relative",
        tabId === 'themes' ? 'h-20' : 'h-16'
      )}>
        {tabId === 'colors' && (
          <div className="w-full h-full bg-gradient-to-b from-muted/40 to-card/60 flex flex-col items-center justify-center gap-1.5 px-2">
            <div className="w-7 h-7 rounded-full bg-muted/50 border border-border/40 shadow-sm" />
            <span
              className="text-[11px] font-bold truncate max-w-full"
              style={!isGradient
                ? { color: color || 'hsl(var(--foreground))' }
                : { background: color, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
              }
            >
              {displayName}
            </span>
          </div>
        )}

        {tabId === 'titles' && (
          <div className="w-full h-full bg-gradient-to-b from-muted/40 to-card/60 flex flex-col items-center justify-center gap-1.5 px-1">
            <div className="w-7 h-7 rounded-full bg-muted/50 border border-border/40 shadow-sm" />
            <div className="flex items-center gap-1 max-w-full">
              <span className="text-[9px] text-muted-foreground truncate">{displayName}</span>
            </div>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold truncate max-w-full -mt-0.5">
              {item.reward_icon} {item.reward_name}
            </span>
          </div>
        )}

        {tabId === 'effects' && (
          <div className="w-full h-full bg-gradient-to-b from-muted/40 to-card/60 flex flex-col items-center justify-center gap-1.5 px-2">
            <div className="w-7 h-7 rounded-full bg-muted/50 border border-border/40 shadow-sm" />
            <span className={cn("text-[11px] font-bold text-foreground truncate max-w-full", effectClass)}>
              {displayName}
            </span>
          </div>
        )}

        {tabId === 'frames' && (
          <div className="w-full h-full bg-gradient-to-b from-muted/40 to-card/60 flex flex-col items-center justify-center gap-1.5 px-2">
            <div className={cn(
              "w-9 h-9 rounded-full bg-muted/50",
              frameStyle?.ring,
              frameStyle?.shadow,
            )} />
            <span className="text-[9px] text-muted-foreground truncate max-w-full">{displayName}</span>
          </div>
        )}

        {tabId === 'themes' && (() => {
          const bg = preview
            ? `linear-gradient(135deg, ${preview.from} 0%, ${preview.to} 100%)`
            : 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))';
          return (
            <div className="w-full h-full relative" style={{ background: bg }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2">
                <div className="w-7 h-7 rounded-full bg-white/25 border border-white/40 shadow-sm" />
                <span className="text-[10px] font-bold text-white/90 truncate max-w-full drop-shadow-sm">{displayName}</span>
                <div className="flex gap-1">
                  <div className="w-10 h-1.5 rounded-full bg-white/25" />
                  <div className="w-6 h-1.5 rounded-full bg-white/15" />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Label */}
      <div className="text-center space-y-0.5 w-full relative z-[1]">
        {tabId === 'colors' && color ? (
          <span
            className="text-[10px] font-bold leading-tight block truncate"
            style={!isGradient ? { color: item.unlocked ? color : undefined } : {
              background: color,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {item.reward_name}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-foreground leading-tight block truncate">{item.reward_name}</span>
        )}
        <span className="text-[9px] text-muted-foreground font-medium">Lv. {item.level}</span>
      </div>
    </motion.button>
  );
}

// ── Main Locker ─────────────────────────────────────────────────
export function ProfileLocker() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [savingBadges, setSavingBadges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('badges');
  const [selectedItem, setSelectedItem] = useState<LockerItem | null>(null);

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

  // Badge settings
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

  // Equip logic
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

  // Get items for current tab
  const getTabItems = (): LockerItem[] => {
    if (!lockerData) return [];
    switch (activeTab) {
      case 'colors': return lockerData.name_colors;
      case 'titles': return lockerData.titles;
      case 'effects': return lockerData.effects;
      case 'frames': return lockerData.cosmetics;
      case 'themes': return lockerData.profile_themes;
      default: return [];
    }
  };

  const isItemEquipped = (item: LockerItem): boolean => {
    if (!lockerData) return false;
    const key = TAB_TO_EQUIPPED_KEY[activeTab];
    if (!key) return false;
    return (lockerData[key] as string | null) === item.reward_name;
  };

  const equippedCount = [
    lockerData?.equippedTitle,
    lockerData?.equippedEffect,
    lockerData?.equippedFrame,
    lockerData?.equippedNameColor,
    lockerData?.equippedProfileTheme,
  ].filter(Boolean).length;

  const tabItems = getTabItems();
  const hasCosmeticTab = activeTab !== 'badges' && activeTab !== 'shop';

  return (
    <div className="flex flex-col min-h-[400px] pb-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="text-center py-3">
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/20 shadow-sm">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground tracking-tight">Your Locker</span>
          {equippedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 font-bold">{equippedCount} active</span>
          )}
        </div>
        {lockerData && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Level {lockerData.userLevel}</span>
          </div>
        )}
      </div>

      {/* ── Tab Bar ────────────────────────────────────────── */}
      <div className="relative overflow-x-auto scrollbar-hide -mx-1 px-1">
        <div className="flex gap-1 min-w-max pb-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  haptics.select();
                  setActiveTab(tab.id);
                  setSelectedItem(null);
                }}
                className={cn(
                  "relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="locker-tab-indicator"
                    className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/25"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────── */}
      <div className="flex-1 mt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'badges' && (
              <BadgesContent
                earnedBadges={earnedBadges}
                lockedBadges={lockedBadges}
                hasOwnerBadge={hasOwnerBadge}
                hasOwnerWifeBadge={hasOwnerWifeBadge}
                hasModBadge={hasModBadge}
                hasVerifiedBadge={hasVerifiedBadge}
                settings={settings}
                handleToggle={handleToggle}
                handleSaveBadgeSettings={handleSaveBadgeSettings}
                savingBadges={savingBadges}
              />
            )}

            {activeTab === 'shop' && <ShopContent />}

            {hasCosmeticTab && (
              <div className={cn(
                "grid gap-2",
                activeTab === 'themes' ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"
              )}>
                {tabItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isEquipped={isItemEquipped(item)}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                    tabId={activeTab}
                    displayName={profile?.display_name || profile?.username || 'You'}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom Action Bar ─────────────────────────────── */}
      <AnimatePresence>
        {selectedItem && hasCosmeticTab && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="sticky bottom-0 mt-4 rounded-2xl bg-card/90 backdrop-blur-xl border border-border/60 p-4 shadow-xl shadow-black/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">{selectedItem.reward_icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{selectedItem.reward_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {selectedItem.reward_description || `Level ${selectedItem.level} reward`}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Lv. {selectedItem.level}
              </span>
            </div>

            {!selectedItem.unlocked ? (
              <Button disabled className="w-full rounded-xl" size="lg">
                <Lock className="w-4 h-4 mr-2" />
                LOCKED — Level {selectedItem.level}
              </Button>
            ) : isItemEquipped(selectedItem) ? (
              <Button
                variant="secondary"
                className="w-full rounded-xl"
                size="lg"
                disabled={equipItem.isPending}
                onClick={() => {
                  const equipType = TAB_TO_EQUIP_TYPE[activeTab];
                  if (equipType) handleEquip(equipType, selectedItem);
                }}
              >
                <Check className="w-4 h-4 mr-2" />
                EQUIPPED
              </Button>
            ) : (
              <Button
                className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white"
                size="lg"
                disabled={equipItem.isPending}
                onClick={() => {
                  const equipType = TAB_TO_EQUIP_TYPE[activeTab];
                  if (equipType) handleEquip(equipType, selectedItem);
                }}
              >
                EQUIP
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Badge Tab Content ───────────────────────────────────────────
function BadgesContent({ earnedBadges, lockedBadges, hasOwnerBadge, hasOwnerWifeBadge, hasModBadge, hasVerifiedBadge, settings, handleToggle, handleSaveBadgeSettings, savingBadges }: {
  earnedBadges: any[];
  lockedBadges: any[];
  hasOwnerBadge: boolean;
  hasOwnerWifeBadge: boolean;
  hasModBadge: boolean;
  hasVerifiedBadge: boolean | undefined;
  settings: BadgeSettings;
  handleToggle: (key: keyof BadgeSettings) => void;
  handleSaveBadgeSettings: () => void;
  savingBadges: boolean;
}) {
  return (
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
  );
}

// ── Shop Tab Content ────────────────────────────────────────────
function ShopContent() {
  return (
    <div className="rounded-2xl bg-card/40 p-5 text-center">
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
    </div>
  );
}
