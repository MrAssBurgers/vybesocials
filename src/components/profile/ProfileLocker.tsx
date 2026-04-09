import { useState, memo, useCallback, useMemo } from 'react';
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
import { FounderBadge } from '@/components/badges/FounderBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { PurchasedItems } from './PurchasedItems';
import {
  NAME_COLOR_MAP, RESTRICTED_COLORS, THEME_PREVIEW, THEME_IMAGES,
  EFFECT_CLASS_MAP, FRAME_STYLE_MAP, FRAME_COLORS,
} from '@/lib/cosmeticConstants';

// ── Constants ───────────────────────────────────────────────────
const TABS = [
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'frames', label: 'Frames', icon: Diamond },
  { id: 'themes', label: 'Themes', icon: Layers },
  { id: 'purchased', label: 'Purchased', icon: Package },
  { id: 'shop', label: 'Shop', icon: ShoppingBag },
] as const;

type TabId = typeof TABS[number]['id'];

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

// ── Item Card (memoized for perf) ───────────────────────────────
const ItemCard = memo(function ItemCard({ item, isEquipped, isSelected, onSelect, tabId, displayName, isRestricted, justEquipped }: {
  item: LockerItem;
  isEquipped: boolean;
  isSelected: boolean;
  onSelect: () => void;
  tabId: TabId;
  displayName: string;
  isRestricted?: boolean;
  justEquipped?: boolean;
}) {
  const color = tabId === 'colors' ? NAME_COLOR_MAP[item.reward_name] : undefined;
  const isGradient = color?.startsWith('linear');
  const preview = tabId === 'themes' ? THEME_PREVIEW[item.reward_name] : undefined;
  const themeImage = tabId === 'themes' ? THEME_IMAGES[item.reward_name] : undefined;
  const effectClass = tabId === 'effects' ? EFFECT_CLASS_MAP[item.reward_name] : undefined;
  const frameStyle = tabId === 'frames' ? FRAME_STYLE_MAP[item.reward_name] : undefined;
  const frameColor = tabId === 'frames' ? FRAME_COLORS[item.reward_name] : undefined;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all duration-150 active:scale-[0.97]",
        "backdrop-blur-xl bg-card/30",
        justEquipped && "animate-[equip-flash_0.6s_ease-out]",
        isSelected
          ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10"
          : item.unlocked && !isRestricted
            ? "border-border/30 hover:border-primary/30 hover:bg-card/50"
            : "border-border/20 cursor-default"
      )}
    >
      {/* Frosted glass overlay */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] via-transparent to-foreground/[0.02]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      </div>

      {/* Equipped checkmark */}
      {isEquipped && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 shadow-md shadow-green-500/30 flex items-center justify-center z-10">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Lock icon */}
      {(!item.unlocked || isRestricted) && !isEquipped && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center z-10">
          <Lock className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )}

      {/* Restricted badge */}
      {isRestricted && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <span className={cn(
            "text-[7px] font-bold px-1 py-0.5 rounded uppercase flex items-center gap-0.5",
            RESTRICTED_COLORS[item.reward_name] === 'owner'
              ? "bg-yellow-500/20 text-yellow-500"
              : "bg-blue-500/20 text-blue-400"
          )}>
            {RESTRICTED_COLORS[item.reward_name] === 'owner' ? <Crown className="w-2 h-2" /> : <Shield className="w-2 h-2" />}
            {RESTRICTED_COLORS[item.reward_name] === 'owner' ? 'Owner' : 'Mod'}
          </span>
        </div>
      )}

      {/* ── Mini Profile Preview ──────────────────────────── */}
      <div className={cn(
        "w-full rounded-xl overflow-hidden relative",
        tabId === 'themes' ? 'h-24' : tabId === 'effects' ? 'h-20' : 'h-16'
      )}>
        {tabId === 'colors' && (
          <div className="w-full h-full flex items-center justify-center px-2">
            <span
              className="text-sm font-extrabold truncate max-w-full"
              style={!isGradient
                ? { color: color || 'hsl(var(--foreground))', WebkitTextFillColor: color || 'hsl(var(--foreground))' }
                : { background: color, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }
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
            <span className={cn("text-sm font-extrabold text-foreground truncate max-w-full", effectClass)}>
              {displayName}
            </span>
          </div>
        )}

        {tabId === 'frames' && (
          <div className="w-full h-full bg-gradient-to-b from-muted/40 to-card/60 flex flex-col items-center justify-center gap-1.5 px-2">
            <div
              className={cn("w-9 h-9 rounded-full bg-muted/50", frameStyle?.ring, frameStyle?.shadow)}
              style={frameColor ? { boxShadow: `0 0 10px ${frameColor}, inset 0 0 0 2px ${frameColor}` } : undefined}
            />
            <span className="text-[9px] text-muted-foreground truncate max-w-full">{displayName}</span>
          </div>
        )}

        {tabId === 'themes' && (
          <div className="w-full h-full relative overflow-hidden">
            {themeImage ? (
              <img src={themeImage} alt={item.reward_name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full" style={{ background: preview ? `linear-gradient(135deg, ${preview.from}, ${preview.to})` : 'hsl(var(--muted))' }} />
            )}
            <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center gap-1.5 px-2">
              <div className="w-7 h-7 rounded-full bg-white/25 border border-white/40 shadow-sm" />
              <span className="text-[10px] font-bold text-white/90 truncate max-w-full drop-shadow-sm">{displayName}</span>
              <div className="flex gap-1">
                <div className="w-10 h-1.5 rounded-full bg-white/25" />
                <div className="w-6 h-1.5 rounded-full bg-white/15" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="text-center space-y-0.5 w-full relative z-[1]">
        {tabId === 'colors' && color ? (
          <span
            className="text-[10px] font-bold leading-tight block truncate"
            style={!isGradient ? { color: color } : {
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
    </button>
  );
});

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

  const isColorRestricted = useCallback((name: string): boolean => {
    const restriction = RESTRICTED_COLORS[name];
    if (!restriction) return false;
    if (restriction === 'owner') return !hasOwnerBadge;
    if (restriction === 'mod') return !hasModBadge && !hasOwnerBadge;
    return false;
  }, [hasOwnerBadge, hasModBadge]);

  const hasRoleUnlock = useCallback((name: string): boolean => {
    const restriction = RESTRICTED_COLORS[name];
    if (!restriction) return false;
    if (restriction === 'owner' && hasOwnerBadge) return true;
    if (restriction === 'mod' && (hasModBadge || hasOwnerBadge)) return true;
    return false;
  }, [hasOwnerBadge, hasModBadge]);

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

  const [justEquipped, setJustEquipped] = useState<string | null>(null);

  const handleEquip = useCallback((type: 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme', item: LockerItem) => {
    if (!item.unlocked && !hasRoleUnlock(item.reward_name)) return;
    if (equipItem.isPending) return;
    if (type === 'name_color' && isColorRestricted(item.reward_name)) return;
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
          if (newValue) {
            setJustEquipped(item.id);
            setTimeout(() => setJustEquipped(null), 1200);
            toast.success(`✨ ${item.reward_name} equipped!`, { duration: 2000 });
          } else {
            toast.success(`Unequipped`, { duration: 1500 });
          }
        },
        onError: () => {
          haptics.error();
          toast.error('Failed to update');
        },
      }
    );
  }, [lockerData, equipItem, hasRoleUnlock, isColorRestricted]);

  const tabItems = useMemo((): LockerItem[] => {
    if (!lockerData) return [];
    switch (activeTab) {
      case 'colors': return lockerData.name_colors.map(item => 
        hasRoleUnlock(item.reward_name) ? { ...item, unlocked: true } : item
      );
      case 'titles': return lockerData.titles;
      case 'effects': return lockerData.effects;
      case 'frames': return lockerData.cosmetics;
      case 'themes': return lockerData.profile_themes;
      default: return [];
    }
  }, [lockerData, activeTab, hasRoleUnlock]);

  const isItemEquipped = useCallback((item: LockerItem): boolean => {
    if (!lockerData) return false;
    const key = TAB_TO_EQUIPPED_KEY[activeTab];
    if (!key) return false;
    return (lockerData[key] as string | null) === item.reward_name;
  }, [lockerData, activeTab]);

  const equippedCount = [
    lockerData?.equippedTitle,
    lockerData?.equippedEffect,
    lockerData?.equippedFrame,
    lockerData?.equippedNameColor,
    lockerData?.equippedProfileTheme,
  ].filter(Boolean).length;

  const hasCosmeticTab = activeTab !== 'badges' && activeTab !== 'shop' && activeTab !== 'purchased';
  const displayName = profile?.display_name || profile?.username || 'You';

  return (
    <div className="flex flex-col min-h-[calc(100vh-200px)] pb-24">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="text-center py-3">
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/20 shadow-sm">
          <Package style={{ width: 16, height: 16 }} className="text-primary" />
          <span className="text-sm font-bold text-foreground tracking-tight">Your Locker</span>
          {equippedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 font-bold">{equippedCount} active</span>
          )}
        </div>
        {lockerData && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Zap style={{ width: 12, height: 12 }} className="text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Level {lockerData.userLevel}</span>
          </div>
        )}
      </div>

      {/* ── Tab Bar ────────────────────────────────────────── */}
      <div className="relative overflow-x-auto scrollbar-hide -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  "relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap touch-manipulation",
                  isActive ? "text-primary-foreground" : "text-muted-foreground active:bg-muted/60"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/25" />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────── */}
      <div className="flex-1 mt-2">
        {/* Instant tab switching - no AnimatePresence blocking */}
        <div key={activeTab} className="animate-in fade-in duration-100">
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
              equippedBadgeId={lockerData?.equippedBadgeId || null}
              onEquipBadge={(badgeId) => {
                const newValue = lockerData?.equippedBadgeId === badgeId ? null : badgeId;
                equipItem.mutate(
                  { type: 'badge', value: newValue },
                  {
                    onSuccess: () => {
                      haptics.success();
                      toast.success(newValue ? '✨ Badge equipped!' : 'Badge unequipped', { duration: 2000 });
                    },
                    onError: () => {
                      haptics.error();
                      toast.error('Failed to update');
                    },
                  }
                );
              }}
              isEquipping={equipItem.isPending}
            />
          )}

          {activeTab === 'purchased' && <PurchasedItems />}
          {activeTab === 'shop' && <ShopContent />}

          {hasCosmeticTab && tabItems.length > 0 && (
            <div className={cn(
              "grid gap-2",
              (activeTab === 'themes' || activeTab === 'effects') ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"
            )}>
              {tabItems.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  isEquipped={isItemEquipped(item)}
                  isSelected={selectedItem?.id === item.id}
                  onSelect={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                  tabId={activeTab}
                  displayName={displayName}
                  isRestricted={activeTab === 'colors' ? isColorRestricted(item.reward_name) : false}
                  justEquipped={justEquipped === item.id}
                />
              ))}
            </div>
          )}

          {hasCosmeticTab && tabItems.length === 0 && lockerData && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No items available yet
            </div>
          )}

          {hasCosmeticTab && !lockerData && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Action Bar ─────────────────────────────── */}
      <AnimatePresence>
        {selectedItem && hasCosmeticTab && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
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

            {activeTab === 'colors' && isColorRestricted(selectedItem.reward_name) ? (
              <Button disabled className="w-full rounded-xl" size="lg">
                {RESTRICTED_COLORS[selectedItem.reward_name] === 'owner' ? (
                  <><Crown className="w-4 h-4 mr-2" /> OWNER ONLY</>
                ) : (
                  <><Shield className="w-4 h-4 mr-2" /> MOD ONLY</>
                )}
              </Button>
            ) : !selectedItem.unlocked ? (
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
                EQUIPPED — Tap to Unequip
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
function BadgesContent({ earnedBadges, lockedBadges, hasOwnerBadge, hasOwnerWifeBadge, hasModBadge, hasVerifiedBadge, settings, handleToggle, handleSaveBadgeSettings, savingBadges, equippedBadgeId, onEquipBadge, isEquipping }: {
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
  equippedBadgeId: string | null;
  onEquipBadge: (badgeId: string) => void;
  isEquipping: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {earnedBadges.length > 0 && (
        <div className="rounded-2xl bg-card/40 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Earned — Tap to equip
            </span>
            <Link to="/badges" className="text-[10px] text-primary font-semibold hover:underline">View All →</Link>
          </div>
          <p className="text-[9px] text-muted-foreground mb-2">Only 1 badge can be displayed on your profile</p>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
            {earnedBadges.map((badge, i) => {
              const isEquipped = equippedBadgeId === badge.id;
              return (
                <button
                  key={badge.id}
                  onClick={() => !isEquipping && onEquipBadge(badge.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 group transition-all duration-150 active:scale-95 rounded-xl p-1",
                    isEquipped ? "bg-green-500/10 ring-1 ring-green-500/40" : "hover:bg-primary/5"
                  )}
                  style={{ animationDelay: `${Math.min(i * 20, 150)}ms` }}
                  disabled={isEquipping}
                >
                  <div className="relative">
                    {badge.name === 'Founder' ? (
                      <FounderBadge size="md" locked={false} showTooltip={false} />
                    ) : (
                      <div className={cn(
                        "w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border flex items-center justify-center text-lg group-hover:scale-110 group-hover:shadow-md group-hover:shadow-primary/15 transition-all duration-200",
                        isEquipped ? "border-green-500/40" : "border-primary/20"
                      )}>
                        {badge.icon}
                      </div>
                    )}
                    {isEquipped && (
                      <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                        <Check className="w-2 h-2 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    "text-[8px] text-center truncate w-full leading-tight",
                    isEquipped ? "text-green-500 font-semibold" : "text-muted-foreground"
                  )}>{badge.name}</span>
                </button>
              );
            })}
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
            {lockedBadges.slice(0, 14).map((badge) => (
              <div
                key={badge.id}
                className="flex flex-col items-center gap-1 opacity-40"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/20 flex items-center justify-center text-lg grayscale">{badge.icon}</div>
                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-muted flex items-center justify-center">
                    <Lock className="w-1.5 h-1.5 text-muted-foreground" />
                  </div>
                </div>
                <span className="text-[8px] text-muted-foreground text-center truncate w-full">{badge.name}</span>
              </div>
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
      <span className="inline-block text-5xl mb-3">🛍️</span>
      <h3 className="text-base font-bold text-foreground mb-1">Profile Shop</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-[200px] mx-auto leading-relaxed">
        Browse exclusive cosmetics and profile upgrades
      </p>
      <Link
        to="/marketplace"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        Browse Shop
      </Link>
    </div>
  );
}
