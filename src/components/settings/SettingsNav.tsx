import { useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  User, 
  Lock, 
  Link2, 
  Palette, 
  Sparkles, 
  Vibrate, 
  Bell, 
  Globe, 
  HelpCircle,
  Code2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebugPanel } from '@/contexts/DebugPanelContext';

export type SettingsCategory = 
  | 'profile' 
  | 'privacy' 
  | 'connections' 
  | 'appearance' 
  | 'themes' 
  | 'feedback' 
  | 'notifications' 
  | 'language' 
  | 'help'
  | 'developer';

interface SettingsNavProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

const baseCategories = [
  { id: 'profile' as const, label: 'Profile', icon: User, description: 'Your info' },
  { id: 'privacy' as const, label: 'Privacy', icon: Lock, description: 'Security settings' },
  { id: 'connections' as const, label: 'Connections', icon: Link2, description: 'Linked accounts' },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette, description: 'Look & feel' },
  { id: 'themes' as const, label: 'Themes', icon: Sparkles, description: 'Custom themes' },
  { id: 'feedback' as const, label: 'Feedback', icon: Vibrate, description: 'Haptics & sounds' },
  { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Alerts' },
  { id: 'language' as const, label: 'Language', icon: Globe, description: 'App language' },
  { id: 'help' as const, label: 'Help', icon: HelpCircle, description: 'Support' },
];

function useCategories() {
  const debugPanel = useDebugPanel();
  const showDev = import.meta.env.DEV || debugPanel?.isAdmin;
  if (showDev) {
    return [...baseCategories, { id: 'developer' as const, label: 'Developer', icon: Code2, description: 'Dev tools' }];
  }
  return baseCategories;
}

// Mobile: Clean dropdown selector
export function SettingsNav({ activeCategory, onCategoryChange }: SettingsNavProps) {
  const [isOpen, setIsOpen] = useState(false);
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
          "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl",
          "bg-card border border-border transition-all",
          isOpen && "border-primary/50 bg-primary/5"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ActiveIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{activeItem?.label}</p>
            <p className="text-xs text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{activeItem?.description}</p>
          </div>
        </div>
        <ChevronDown className={cn(
          "w-5 h-5 text-foreground/80 transition-transform",
          isOpen && "rotate-180"
        )} />
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
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto"
            >
              {categories.map((cat, index) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    haptics.tap();
                    onCategoryChange(cat.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                    activeCategory === cat.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50",
                    index !== categories.length - 1 && "border-b border-border/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    activeCategory === cat.id ? "bg-primary/20" : "bg-muted"
                  )}>
                    <cat.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{cat.label}</p>
                    <p className="text-xs text-foreground/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{cat.description}</p>
                  </div>
                  {activeCategory === cat.id && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Horizontal nav for desktop (fits within main content area)
export function SettingsNavVertical({ activeCategory, onCategoryChange }: SettingsNavProps) {
  const categories = useCategories();
  return (
    <nav className="flex flex-wrap gap-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => {
            haptics.tap();
            onCategoryChange(cat.id);
          }}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-left transition-all duration-200',
            'active:scale-[0.98] border whitespace-nowrap',
            activeCategory === cat.id
              ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
              : 'bg-transparent border-border hover:bg-muted/50 text-foreground hover:border-primary/30'
          )}
        >
          <cat.icon className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{cat.label}</span>
        </button>
      ))}
    </nav>
  );
}
