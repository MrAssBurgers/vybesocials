import { cn } from '@/lib/utils';
import { useRef, useEffect } from 'react';
import { 
  User, 
  Lock, 
  Link2, 
  Crown,
  Palette, 
  Sparkles, 
  Vibrate, 
  Bell, 
  Globe, 
  HelpCircle,
  Bot,
  Code2,
  ChevronRight,
  Shield,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { motion } from 'framer-motion';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';

const DEV_USERNAMES = ['bakrix', 'mrassburgers'];

export type SettingsCategory = 
  | 'profile' 
  | 'privacy' 
  | 'security'
  | 'connections' 
  | 'subscription'
  | 'ai'
  | 'appearance' 
  | 'themes' 
  | 'feedback' 
  | 'notifications' 
  | 'language' 
  | 'help'
  | 'developer'
  | 'parental'
  | 'screentime';

export interface SettingsCategoryMeta {
  id: SettingsCategory;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
  /** iOS-style colored icon tile gradient */
  tile: string;
}

const CATEGORY_META: Record<SettingsCategory, SettingsCategoryMeta> = {
  profile:       { id: 'profile', labelKey: 'settingsNav.profile', icon: User, descKey: 'settingsNav.profileDesc', tile: 'from-sky-400 to-blue-600' },
  privacy:       { id: 'privacy', labelKey: 'settingsNav.privacy', icon: Lock, descKey: 'settingsNav.privacyDesc', tile: 'from-rose-400 to-red-600' },
  security:      { id: 'security', labelKey: 'Security & 2FA', icon: Shield, descKey: 'Two-factor and devices', tile: 'from-emerald-400 to-green-600' },
  connections:   { id: 'connections', labelKey: 'settingsNav.connections', icon: Link2, descKey: 'settingsNav.connectionsDesc', tile: 'from-violet-400 to-purple-600' },
  subscription:  { id: 'subscription', labelKey: 'settingsNav.subscription', icon: Crown, descKey: 'settingsNav.subscriptionDesc', tile: 'from-amber-400 to-orange-500' },
  ai:            { id: 'ai', labelKey: 'VYBE AI', icon: Bot, descKey: 'Usage limits & your API key', tile: 'from-indigo-400 to-violet-600' },
  appearance:    { id: 'appearance', labelKey: 'settingsNav.appearance', icon: Palette, descKey: 'settingsNav.appearanceDesc', tile: 'from-fuchsia-400 to-pink-600' },
  themes:        { id: 'themes', labelKey: 'settingsNav.themes', icon: Sparkles, descKey: 'settingsNav.themesDesc', tile: 'from-purple-400 to-indigo-600' },
  feedback:      { id: 'feedback', labelKey: 'settingsNav.feedback', icon: Vibrate, descKey: 'settingsNav.feedbackDesc', tile: 'from-orange-400 to-red-500' },
  notifications: { id: 'notifications', labelKey: 'settingsNav.notifications', icon: Bell, descKey: 'settingsNav.notificationsDesc', tile: 'from-red-400 to-rose-600' },
  language:      { id: 'language', labelKey: 'settingsNav.language', icon: Globe, descKey: 'settingsNav.languageDesc', tile: 'from-cyan-400 to-blue-500' },
  help:          { id: 'help', labelKey: 'settingsNav.help', icon: HelpCircle, descKey: 'settingsNav.helpDesc', tile: 'from-teal-400 to-emerald-600' },
  parental:      { id: 'parental', labelKey: 'Parental Controls', icon: Shield, descKey: 'Manage child safety settings', tile: 'from-green-400 to-teal-600' },
  screentime:    { id: 'screentime', labelKey: 'Screen Time', icon: Clock, descKey: 'Track your usage', tile: 'from-indigo-400 to-violet-600' },
  developer:     { id: 'developer', labelKey: 'settingsNav.developer', icon: Code2, descKey: 'settingsNav.developerDesc', tile: 'from-zinc-400 to-zinc-600' },
};

export function getCategoryMeta(id: SettingsCategory): SettingsCategoryMeta {
  return CATEGORY_META[id];
}

interface SettingsGroup {
  title: string;
  items: SettingsCategory[];
}

const BASE_GROUPS: SettingsGroup[] = [
  { title: 'Account', items: ['profile', 'privacy', 'security', 'connections'] },
  { title: 'Personalization', items: ['themes', 'appearance', 'language'] },
  { title: 'Notifications & Sounds', items: ['notifications', 'feedback'] },
  { title: 'Membership', items: ['subscription', 'ai'] },
  { title: 'Wellbeing', items: ['parental', 'screentime'] },
  { title: 'Support', items: ['help'] },
];

export function useSettingsGroups(): SettingsGroup[] {
  const debugPanel = useDebugPanel();
  const { profile } = useAuth();
  const isDevUser = !!profile?.username && DEV_USERNAMES.includes(profile.username.toLowerCase());
  const showDev = import.meta.env.DEV || debugPanel?.isAdmin || isDevUser;
  if (showDev) {
    return [...BASE_GROUPS, { title: 'Advanced', items: ['developer'] }];
  }
  return BASE_GROUPS;
}

/** Colored icon tile (iOS-style) */
export function CategoryTile({ category, size = 'md' }: { category: SettingsCategory; size?: 'sm' | 'md' }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <div className={cn(
      'rounded-[10px] bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-md',
      size === 'md' ? 'w-9 h-9' : 'w-7 h-7 rounded-lg',
      meta.tile
    )}>
      <Icon className={cn('text-white drop-shadow-sm', size === 'md' ? 'w-[18px] h-[18px]' : 'w-3.5 h-3.5')} strokeWidth={2.25} />
    </div>
  );
}

interface SettingsHomeListProps {
  onSelect: (category: SettingsCategory) => void;
}

/** Mobile home — grouped, scannable settings list */
export function SettingsHomeList({ onSelect }: SettingsHomeListProps) {
  const { t } = useTranslation();
  const groups = useSettingsGroups();

  return (
    <div className="space-y-5">
      {groups.map((group, gi) => (
        <motion.div
          key={group.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(gi * 0.05, 0.3), duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p className="px-4 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            {group.title}
          </p>
          <div className="liquid-glass-card overflow-hidden">
            {group.items.map((id, index) => {
              const meta = CATEGORY_META[id];
              return (
                <button
                  key={id}
                  data-tutorial={id === 'themes' ? 'themes-section' : undefined}
                  onClick={() => {
                    haptics.tap();
                    onSelect(id);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors outline-none focus:outline-none',
                    'active:bg-muted/50 hover:bg-muted/30',
                    index !== group.items.length - 1 && 'border-b border-foreground/[0.06]'
                  )}
                >
                  <CategoryTile category={id} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[15px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{t(meta.labelKey)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t(meta.descKey)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

/** Desktop — grouped sidebar navigation */
export function SettingsSidebar({ activeCategory, onCategoryChange }: SettingsSidebarProps) {
  const { t } = useTranslation();
  const groups = useSettingsGroups();

  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map((id) => {
              const meta = CATEGORY_META[id];
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  data-tutorial={id === 'themes' ? 'themes-section' : undefined}
                  onClick={() => {
                    haptics.tap();
                    onCategoryChange(id);
                  }}
                  className={cn(
                    'relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors duration-150 outline-none focus:outline-none',
                    isActive
                      ? 'text-foreground'
                      : 'text-foreground/65 hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-sidebar-active"
                      className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/25"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                    <CategoryTile category={id} size="sm" />
                    <span className="font-medium text-sm truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{t(meta.labelKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Mobile detail — sticky horizontal category strip so groups stay visible while scrolling */
export function SettingsCategoryStrip({
  activeCategory,
  onCategoryChange,
}: SettingsSidebarProps) {
  const { t } = useTranslation();
  const groups = useSettingsGroups();
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active pill scrolled into view when switching categories
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategory]);

  return (
    <div
      className="sticky z-20 -mx-3 px-3 py-2 mb-4 backdrop-blur-xl bg-background/80 border-b border-foreground/[0.06]"
      style={{ top: 0 }}
    >
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {groups.flatMap(g => g.items).map((id) => {
          const meta = CATEGORY_META[id];
          const isActive = activeCategory === id;
          return (
            <button
              key={id}
              data-active={isActive ? 'true' : undefined}
              onClick={() => {
                haptics.tap();
                onCategoryChange(id);
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full flex-shrink-0 transition-colors duration-200 outline-none focus:outline-none',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 pl-3 pr-4'
                  : 'bg-muted/40 text-foreground/70 active:bg-muted/60'
              )}
            >
              {!isActive && <CategoryTile category={id} size="sm" />}
              <span className="text-xs font-semibold whitespace-nowrap">{t(meta.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
