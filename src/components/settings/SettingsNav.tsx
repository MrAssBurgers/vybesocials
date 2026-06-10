import { useState } from 'react';
import { cn } from '@/lib/utils';
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
  Code2,
  ChevronDown,
  Check,
  Shield,
  Clock,
} from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
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
  | 'appearance' 
  | 'themes' 
  | 'feedback' 
  | 'notifications' 
  | 'language' 
  | 'help'
  | 'developer'
  | 'parental'
  | 'screentime';

interface SettingsNavProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

// iOS-style colored icon tiles — instantly scannable
const baseCategories = [
  { id: 'profile' as const, labelKey: 'settingsNav.profile', icon: User, descKey: 'settingsNav.profileDesc', tile: 'from-sky-400 to-blue-600', tint: 'text-sky-400' },
  { id: 'privacy' as const, labelKey: 'settingsNav.privacy', icon: Lock, descKey: 'settingsNav.privacyDesc', tile: 'from-rose-400 to-red-600', tint: 'text-rose-400' },
  { id: 'security' as const, labelKey: 'Security & 2FA', icon: Shield, descKey: 'Two-factor and devices', tile: 'from-emerald-400 to-green-600', tint: 'text-emerald-400' },
  { id: 'connections' as const, labelKey: 'settingsNav.connections', icon: Link2, descKey: 'settingsNav.connectionsDesc', tile: 'from-violet-400 to-purple-600', tint: 'text-violet-400' },
  { id: 'subscription' as const, labelKey: 'settingsNav.subscription', icon: Crown, descKey: 'settingsNav.subscriptionDesc', tile: 'from-amber-400 to-orange-500', tint: 'text-amber-400' },
  { id: 'appearance' as const, labelKey: 'settingsNav.appearance', icon: Palette, descKey: 'settingsNav.appearanceDesc', tile: 'from-fuchsia-400 to-pink-600', tint: 'text-fuchsia-400' },
  { id: 'themes' as const, labelKey: 'settingsNav.themes', icon: Sparkles, descKey: 'settingsNav.themesDesc', tile: 'from-purple-400 to-indigo-600', tint: 'text-purple-400' },
  { id: 'feedback' as const, labelKey: 'settingsNav.feedback', icon: Vibrate, descKey: 'settingsNav.feedbackDesc', tile: 'from-orange-400 to-red-500', tint: 'text-orange-400' },
  { id: 'notifications' as const, labelKey: 'settingsNav.notifications', icon: Bell, descKey: 'settingsNav.notificationsDesc', tile: 'from-red-400 to-rose-600', tint: 'text-red-400' },
  { id: 'language' as const, labelKey: 'settingsNav.language', icon: Globe, descKey: 'settingsNav.languageDesc', tile: 'from-cyan-400 to-blue-500', tint: 'text-cyan-400' },
  { id: 'help' as const, labelKey: 'settingsNav.help', icon: HelpCircle, descKey: 'settingsNav.helpDesc', tile: 'from-teal-400 to-emerald-600', tint: 'text-teal-400' },
  { id: 'parental' as const, labelKey: 'Parental Controls', icon: Shield, descKey: 'Manage child safety settings', tile: 'from-green-400 to-teal-600', tint: 'text-green-400' },
  { id: 'screentime' as const, labelKey: 'Screen Time', icon: Clock, descKey: 'Track your usage', tile: 'from-indigo-400 to-violet-600', tint: 'text-indigo-400' },
];

function useCategories() {
  const debugPanel = useDebugPanel();
  const { profile } = useAuth();
  const isDevUser = !!profile?.username && DEV_USERNAMES.includes(profile.username.toLowerCase());
  const showDev = import.meta.env.DEV || debugPanel?.isAdmin || isDevUser;
  if (showDev) {
    return [...baseCategories, { id: 'developer' as const, labelKey: 'settingsNav.developer', icon: Code2, descKey: 'settingsNav.developerDesc', tile: 'from-zinc-400 to-zinc-600', tint: 'text-zinc-400' }];
  }
  return baseCategories;
}

// Mobile: Glass dropdown selector with colored icon tiles
export function SettingsNav({ activeCategory, onCategoryChange }: SettingsNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  const categories = useCategories();
  const activeItem = categories.find(c => c.id === activeCategory);
  const ActiveIcon = activeItem?.icon || User;

  return (
    <div className="relative">
      {/* Selected category button */}
      <button
        onClick={() => {
          haptics.tap();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl",
          "liquid-glass-card transition-all duration-300",
          isOpen && "border-primary/40"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg",
            activeItem?.tile || 'from-sky-400 to-blue-600'
          )}>
            <ActiveIcon className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.25} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{activeItem ? t(activeItem.labelKey) : ''}</p>
            <p className="text-xs text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{activeItem ? t(activeItem.descKey) : ''}</p>
          </div>
        </div>
        <div className={cn(
          "w-7 h-7 rounded-full bg-foreground/[0.06] border border-foreground/[0.08] flex items-center justify-center transition-transform duration-300",
          isOpen && "rotate-180"
        )}>
          <ChevronDown className="w-4 h-4 text-foreground/70" />
        </div>
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute top-full left-0 right-0 mt-2 z-50 bg-card/95 backdrop-blur-2xl border border-foreground/10 rounded-2xl shadow-2xl shadow-background/60 overflow-hidden max-h-[60vh] overflow-y-auto p-1.5"
            >
              {categories.map((cat, index) => (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2), duration: 0.15 }}
                  onClick={() => {
                    haptics.tap();
                    onCategoryChange(cat.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors text-left",
                    activeCategory === cat.id
                      ? "bg-primary/12 ring-1 ring-primary/25"
                      : "hover:bg-muted/40 active:bg-muted/60"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-[10px] bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-md",
                    cat.tile
                  )}>
                    <cat.icon className="w-[18px] h-[18px] text-white drop-shadow-sm" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{t(cat.labelKey)}</p>
                    <p className="text-xs text-muted-foreground truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{t(cat.descKey)}</p>
                  </div>
                  {activeCategory === cat.id && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Horizontal nav for desktop — animated sliding active pill
export function SettingsNavVertical({ activeCategory, onCategoryChange }: SettingsNavProps) {
  const { t } = useTranslation();
  const categories = useCategories();
  return (
    <nav className="flex flex-wrap gap-1.5">
      {categories.map((cat) => {
        const isActive = activeCategory === cat.id;
        return (
          <button
            key={cat.id}
            data-tutorial={cat.id === 'themes' ? 'themes-section' : undefined}
            onClick={() => {
              haptics.tap();
              onCategoryChange(cat.id);
            }}
            className={cn(
              'relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-left whitespace-nowrap',
              'active:scale-[0.97] transition-transform duration-150'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="settings-active-pill"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/30"
                transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
              />
            )}
            <span className={cn(
              'relative z-10 flex items-center gap-2 transition-colors duration-200',
              isActive ? 'text-primary-foreground' : 'text-foreground/70 hover:text-foreground'
            )}>
              <cat.icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', !isActive && cat.tint)} strokeWidth={2.25} />
              <span className="font-medium text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{t(cat.labelKey)}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
