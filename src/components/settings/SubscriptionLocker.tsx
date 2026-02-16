import { useState, useCallback, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Palette, Type, Wand2, Diamond, Layers, Lock, Check, Crown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEquipItem } from '@/hooks/useLockerItems';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import {
  NAME_COLOR_MAP, THEME_PREVIEW,
  EFFECT_CLASS_MAP, FRAME_STYLE_MAP, FRAME_COLORS,
} from '@/lib/cosmeticConstants';

interface PremiumItem {
  id: string;
  reward_type: string;
  reward_name: string;
  reward_icon: string;
  reward_description: string | null;
}

const TABS = [
  { id: 'colors' as const, label: 'Color', icon: Palette },
  { id: 'titles' as const, label: 'Title', icon: Type },
  { id: 'effects' as const, label: 'Effect', icon: Wand2 },
  { id: 'frames' as const, label: 'Frame', icon: Diamond },
  { id: 'themes' as const, label: 'Theme', icon: Layers },
];

type TabId = typeof TABS[number]['id'];

const TAB_TO_REWARD_TYPE: Record<TabId, string> = {
  colors: 'name_color',
  titles: 'title',
  effects: 'effect',
  frames: 'cosmetic',
  themes: 'profile_theme',
};

const TAB_TO_EQUIP_TYPE: Record<TabId, 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme'> = {
  colors: 'name_color',
  titles: 'title',
  effects: 'effect',
  frames: 'frame',
  themes: 'profile_theme',
};

const TAB_TO_EQUIPPED_KEY: Record<TabId, string> = {
  colors: 'equipped_name_color',
  titles: 'equipped_title',
  effects: 'equipped_effect',
  frames: 'equipped_frame',
  themes: 'equipped_profile_theme',
};

function usePremiumItems() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['premium-locker-items', profile?.id],
    queryFn: async () => {
      if (!profile?.id) throw new Error('No user');

      const [itemsRes, profileRes] = await Promise.all([
        supabase.from('battle_pass_tiers').select('*').eq('is_premium', true).order('level'),
        supabase.from('profiles')
          .select('equipped_title, equipped_effect, equipped_frame, equipped_name_color, equipped_profile_theme')
          .eq('id', profile.id)
          .single(),
      ]);

      return {
        items: (itemsRes.data || []) as PremiumItem[],
        equipped: profileRes.data as Record<string, string | null> | null,
      };
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 10,
  });
}

// ── Compact Item Card ───────────────────────────────────────────
const CompactItemCard = memo(function CompactItemCard({ item, isEquipped, onTap, tabId, displayName, locked }: {
  item: PremiumItem;
  isEquipped: boolean;
  onTap: () => void;
  tabId: TabId;
  displayName: string;
  locked: boolean;
}) {
  const color = tabId === 'colors' ? NAME_COLOR_MAP[item.reward_name] : undefined;
  const isGradient = color?.startsWith('linear');
  const preview = tabId === 'themes' ? THEME_PREVIEW[item.reward_name] : undefined;
  const effectClass = tabId === 'effects' ? EFFECT_CLASS_MAP[item.reward_name] : undefined;
  const frameStyle = tabId === 'frames' ? FRAME_STYLE_MAP[item.reward_name] : undefined;
  const frameColor = tabId === 'frames' ? FRAME_COLORS[item.reward_name] : undefined;

  return (
    <button
      onClick={onTap}
      disabled={locked}
      className={cn(
        "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-150 active:scale-[0.97]",
        "backdrop-blur-xl bg-card/30",
        isEquipped
          ? "border-primary/50 bg-primary/10 shadow-sm shadow-primary/10"
          : locked
            ? "border-border/20 opacity-50 cursor-not-allowed"
            : "border-border/30 hover:border-primary/30 hover:bg-card/50"
      )}
    >
      {/* Equipped check */}
      {isEquipped && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-10">
          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
        </div>
      )}

      {/* Lock */}
      {locked && !isEquipped && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-muted flex items-center justify-center z-10">
          <Lock className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )}

      {/* Crown badge */}
      <div className="absolute top-1.5 left-1.5">
        <Crown className="w-3 h-3 text-primary" />
      </div>

      {/* Preview */}
      <div className={cn("w-full rounded-lg overflow-hidden", tabId === 'themes' ? 'h-20' : 'h-14')}>
        {tabId === 'colors' && (
          <div className="w-full h-full flex items-center justify-center px-1">
            <span
              className="text-sm font-extrabold truncate"
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
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold truncate max-w-full">
              {item.reward_icon} {item.reward_name}
            </span>
          </div>
        )}
        {tabId === 'effects' && (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <span className={cn("text-sm font-extrabold truncate", effectClass)}>
              {displayName}
            </span>
          </div>
        )}
        {tabId === 'frames' && (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <div
              className={cn("w-10 h-10 rounded-full bg-muted/50", frameStyle?.ring, frameStyle?.shadow)}
              style={frameColor ? { boxShadow: `0 0 8px ${frameColor}, inset 0 0 0 2px ${frameColor}` } : undefined}
            />
          </div>
        )}
        {tabId === 'themes' && (
          <div className="w-full h-full relative overflow-hidden rounded-lg">
            <div className="w-full h-full" style={{ background: preview ? `linear-gradient(135deg, ${preview.from}, ${preview.to})` : 'hsl(var(--muted))' }} />
          </div>
        )}
      </div>

      {/* Label */}
      <div className="text-center w-full">
        {tabId === 'colors' && color ? (
          <span
            className="text-[10px] font-bold block truncate"
            style={!isGradient ? { color } : {
              background: color,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {item.reward_name}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-foreground block truncate">{item.reward_name}</span>
        )}
        <span className="text-[8px] text-muted-foreground">Premium Exclusive</span>
      </div>
    </button>
  );
});

// ── Main Component ──────────────────────────────────────────────
export function SubscriptionLocker() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('colors');
  const { data } = usePremiumItems();
  const equipItem = useEquipItem();
  const { isPremium } = usePremiumStatus();

  const displayName = profile?.display_name || profile?.username || 'You';

  const currentItem = useMemo(() => {
    if (!data?.items) return null;
    const rewardType = TAB_TO_REWARD_TYPE[activeTab];
    return data.items.find(i => i.reward_type === rewardType) || null;
  }, [data?.items, activeTab]);

  const isEquipped = useMemo(() => {
    if (!data?.equipped || !currentItem) return false;
    const key = TAB_TO_EQUIPPED_KEY[activeTab];
    return data.equipped[key] === currentItem.reward_name;
  }, [data?.equipped, currentItem, activeTab]);

  const handleEquip = useCallback((item: PremiumItem) => {
    if (!isPremium || equipItem.isPending) return;
    haptics.select();

    const equipType = TAB_TO_EQUIP_TYPE[activeTab];
    const key = TAB_TO_EQUIPPED_KEY[activeTab];
    const currentlyEquipped = data?.equipped?.[key];
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
  }, [data?.equipped, equipItem, activeTab, isPremium]);

  const equippedCount = data?.equipped
    ? Object.values(data.equipped).filter(Boolean).length
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border border-border bg-card p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Premium Cosmetics</h3>
        </div>
        {equippedCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
            {equippedCount} equipped
          </span>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
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

      {/* Single Premium Item */}
      {currentItem ? (
        <div className="flex justify-center">
          <div className="w-36">
            <CompactItemCard
              item={currentItem}
              isEquipped={isEquipped}
              onTap={() => handleEquip(currentItem)}
              tabId={activeTab}
              displayName={displayName}
              locked={!isPremium}
            />
          </div>
        </div>
      ) : data ? (
        <div className="text-center py-6 text-muted-foreground text-xs">
          No premium items available
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="w-36 h-24 rounded-xl bg-muted/30 animate-pulse" />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-3">
        {isPremium ? 'Tap to equip or unequip' : 'Subscribe to unlock exclusive cosmetics'}
      </p>
    </motion.div>
  );
}
