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
  LogOut
} from 'lucide-react';
import { haptics } from '@/lib/haptics';

export type SettingsCategory = 
  | 'profile' 
  | 'privacy' 
  | 'connections' 
  | 'appearance' 
  | 'themes' 
  | 'feedback' 
  | 'notifications' 
  | 'language' 
  | 'help';

interface SettingsNavProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

const categories = [
  { id: 'profile' as const, label: 'Profile', icon: User },
  { id: 'privacy' as const, label: 'Privacy', icon: Lock },
  { id: 'connections' as const, label: 'Connections', icon: Link2 },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'themes' as const, label: 'Themes', icon: Sparkles },
  { id: 'feedback' as const, label: 'Feedback', icon: Vibrate },
  { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  { id: 'language' as const, label: 'Language', icon: Globe },
  { id: 'help' as const, label: 'Help', icon: HelpCircle },
];

export function SettingsNav({ activeCategory, onCategoryChange }: SettingsNavProps) {
  return (
    <nav className="flex overflow-x-auto pb-2 gap-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => {
            haptics.tap();
            onCategoryChange(cat.id);
          }}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all',
            'active:scale-95',
            activeCategory === cat.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <cat.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{cat.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Vertical nav for larger screens
export function SettingsNavVertical({ activeCategory, onCategoryChange }: SettingsNavProps) {
  return (
    <nav className="space-y-1">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => {
            haptics.tap();
            onCategoryChange(cat.id);
          }}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
            'active:scale-[0.98]',
            activeCategory === cat.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
          )}
        >
          <cat.icon className="w-5 h-5" />
          <span>{cat.label}</span>
        </button>
      ))}
    </nav>
  );
}
