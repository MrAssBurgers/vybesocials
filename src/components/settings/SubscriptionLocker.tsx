import { useState, useCallback, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Palette, Type, Wand2, Diamond, Layers, Lock, Check, Crown, Package, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLockerItems, useEquipItem, LockerItem } from '@/hooks/useLockerItems';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isOwner } from '@/components/ui/OwnerBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { cn } from '@/lib/utils';
import {
  NAME_COLOR_MAP, RESTRICTED_COLORS, THEME_PREVIEW, THEME_IMAGES,
  EFFECT_CLASS_MAP, FRAME_STYLE_MAP, FRAME_COLORS,
} from '@/lib/cosmeticConstants';

const TABS = [
  { id: 'colors' as const, label: 'Colors', icon: Palette },
  { id: 'titles' as const, label: 'Titles', icon: Type },
  { id: 'effects' as const, label: 'Effects', icon: Wand2 },
  { id: 'frames' as const, label: 'Frames', icon: Diamond },
  { id: 'themes' as const, label: 'Themes', icon: Layers },
];

type TabId = typeof TABS[number]['id'];

const TAB_TO_EQUIP_TYPE: Record<TabId, 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme'> = {
  colors: 'name_color',
  titles: 'title',
  effects: 'effect',
  frames: 'frame',
  themes: 'profile_theme',
};

const TAB_TO_EQUIPPED_KEY: Record<TabId, string> = {
  colors: 'equippedNameColor',
  titles: 'equippedTitle',
  effects: 'equippedEffect',
  frames: 'equippedFrame',
  themes: 'equippedProfileTheme',
};

// ── Compact Item Card ───────────────────────────────────────────
const CompactItemCard = memo(function CompactItemCard({ item, isEquipped, onTap, tabId, displayName, isRestricted }: {
  item: LockerItem;
  isEquipped: boolean;
  onTap: () => void;
  tabId: TabId;
  displayName: string;
  isRestricted?: boolean;
}) {
  const color = tabId === 'colors' ? NAME_COLOR_MAP[item.reward_name] : undefined;
  const isGradient = color?.startsWith('linear');
  const themeImage = tabId === 'themes' ? THEME_IMAGES[item.reward_name] : undefined;
  const preview = tabId === 'themes' ? THEME_PREVIEW[item.reward_name] : undefined;
  const effectClass = tabId === 'effects' ? EFFECT_CLASS_MAP[item.reward_name] : undefined;
  const frameStyle = tabId === 'frames' ? FRAME_STYLE_MAP[item.reward_name] : undefined;
  const frameColor = tabId === 'frames' ? FRAME_COLORS[item.reward_name] : undefined;

  const locked = (!item.unlocked && !isEquipped) || isRestricted;

  return (
    <button
      onClick={onTap}
      disabled={locked}
      className={cn(
        "relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all duration-150 active:scale-[0.97]",
        "backdrop-blur-xl bg-card/30",
        isEquipped
          ? "border-green-500/50 bg-green-500/10 shadow-sm shadow-green-500/10"
          : locked
            ? "border-border/20 opacity-50 cursor-not-allowed"
            : "border-border/30 hover:border-primary/30 hover:bg-card/50"
      )}
    >
      {/* Equipped check */}
      {isEquipped && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center z-10">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Lock */}
      {locked && !isEquipped && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-muted-foreground/20 flex items-center justify-center z-10">
          <Lock className="w-2 h-2 text-muted-foreground" />
        </div>
      )}

      {/* Preview */}
      <div className={cn(
        "w-full rounded-lg overflow-hidden",
        tabId === 'themes' ? 'h-16' : 'h-12'
      )}>
        {tabId === 'colors' && (
          <div className="w-full h-full flex items-center justify-center px-1">
            <span
              className="text-xs font-extrabold truncate"
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
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted/30">
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold truncate max-w-full">
              {item.reward_icon} {item.reward_name}
            </span>
          </div>
        )}
        {tabId === 'effects' && (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <span className={cn("text-xs font-extrabold truncate", effectClass)}>
              {displayName}
            </span>
          </div>
        )}
        {tabId === 'frames' && (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <div
              className={cn("w-8 h-8 rounded-full bg-muted/50", frameStyle?.ring, frameStyle?.shadow)}
              style={frameColor ? { boxShadow: `0 0 8px ${frameColor}, inset 0 0 0 2px ${frameColor}` } : undefined}
            />
          </div>
        )}
        {tabId === 'themes' && (
          <div className="w-full h-full relative overflow-hidden">
            {themeImage ? (
              <img src={themeImage} alt={item.reward_name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full" style={{ background: preview ? `linear-gradient(135deg, ${preview.from}, ${preview.to})` : 'hsl(var(--muted))' }} />
            )}
          </div>
        )}
      </div>

      {/* Label */}
      <div className="text-center w-full">
        {tabId === 'colors' && color ? (
          <span
            className="text-[9px] font-bold block truncate"
            style={!isGradient ? { color } : {
              background: color,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {item.reward_name}
          </span>
        ) : (
          <span className="text-[9px] font-semibold text-foreground block truncate">{item.reward_name}</span>
        )}
      </div>
    </button>
  );
});

// ── Main Component ──────────────────────────────────────────────
export function SubscriptionLocker() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('colors');
  const { data: lockerData } = useLockerItems();
  const equipItem = useEquipItem();
  const { data: userRole } = useUserRoleById(profile?.id);
  const { isPremium } = usePremiumStatus();

  const hasOwnerBadge = isOwner(profile?.username);
  const hasModBadge = !!userRole;

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

  const tabItems = useMemo((): LockerItem[] => {
    if (!lockerData) return [];
    const markUnlocked = (item: LockerItem): LockerItem =>
      isPremium ? { ...item, unlocked: true } : item;
    switch (activeTab) {
      case 'colors': return lockerData.name_colors.map(item =>
        hasRoleUnlock(item.reward_name) ? { ...item, unlocked: true } : markUnlocked(item)
      );
      case 'titles': return lockerData.titles.map(markUnlocked);
      case 'effects': return lockerData.effects.map(markUnlocked);
      case 'frames': return lockerData.cosmetics.map(markUnlocked);
      case 'themes': return lockerData.profile_themes.map(markUnlocked);
      default: return [];
    }
  }, [lockerData, activeTab, hasRoleUnlock, isPremium]);

  const isItemEquipped = useCallback((item: LockerItem): boolean => {
    if (!lockerData) return false;
    const key = TAB_TO_EQUIPPED_KEY[activeTab] as keyof typeof lockerData;
    return (lockerData[key] as string | null) === item.reward_name;
  }, [lockerData, activeTab]);

  const handleEquip = useCallback((item: LockerItem) => {
    if (!item.unlocked && !hasRoleUnlock(item.reward_name)) return;
    if (equipItem.isPending) return;
    if (activeTab === 'colors' && isColorRestricted(item.reward_name)) return;
    haptics.select();

    const equipType = TAB_TO_EQUIP_TYPE[activeTab];
    const equippedMap: Record<string, string | null | undefined> = {
      title: lockerData?.equippedTitle,
      effect: lockerData?.equippedEffect,
      frame: lockerData?.equippedFrame,
      name_color: lockerData?.equippedNameColor,
      profile_theme: lockerData?.equippedProfileTheme,
    };

    const currentlyEquipped = equippedMap[equipType];
    const newValue = currentlyEquipped === item.reward_name ? null : item.reward_name;

    equipItem.mutate(
      { type: equipType, value: newValue },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(newValue ? `✨ ${item.reward_name} equipped!` : 'Unequipped', { duration: 1500 });
        },
        onError: () => {
          haptics.error();
          toast.error('Failed to update');
        },
      }
    );
  }, [lockerData, equipItem, activeTab, hasRoleUnlock, isColorRestricted]);

  const displayName = profile?.display_name || profile?.username || 'You';

  const equippedCount = [
    lockerData?.equippedTitle,
    lockerData?.equippedEffect,
    lockerData?.equippedFrame,
    lockerData?.equippedNameColor,
    lockerData?.equippedProfileTheme,
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border border-border bg-card p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Premium Cosmetics</h3>
          {equippedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
              {equippedCount} active
            </span>
          )}
        </div>
        {lockerData && (
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold text-muted-foreground">Lv. {lockerData.userLevel}</span>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                haptics.select();
                setActiveTab(tab.id);
              }}
              className={cn(
                "relative flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors whitespace-nowrap",
                isActive ? "text-primary-foreground" : "text-muted-foreground active:bg-muted/60"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/25" />
              )}
              <span className="relative z-10 flex items-center gap-1">
                <Icon style={{ width: 12, height: 12 }} />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Items Grid */}
      {tabItems.length > 0 ? (
        <div className={cn(
          "grid gap-1.5",
          activeTab === 'themes' ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"
        )}>
          {tabItems.map(item => (
            <CompactItemCard
              key={item.id}
              item={item}
              isEquipped={isItemEquipped(item)}
              onTap={() => handleEquip(item)}
              tabId={activeTab}
              displayName={displayName}
              isRestricted={activeTab === 'colors' ? isColorRestricted(item.reward_name) : false}
            />
          ))}
        </div>
      ) : lockerData ? (
        <div className="text-center py-6 text-muted-foreground text-xs">
          No items available yet
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-3">
        Tap to equip or unequip • Premium unlocks all cosmetics
      </p>
    </motion.div>
  );
}
