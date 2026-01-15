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
} from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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

const categories = [
  { id: 'profile' as const, label: 'Profile', icon: User, description: 'Your info' },
  { id: 'privacy' as const, label: 'Privacy', icon: Lock, description: 'Account visibility' },
  { id: 'connections' as const, label: 'Connections', icon: Link2, description: 'Linked accounts' },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette, description: 'Look & feel' },
  { id: 'themes' as const, label: 'Themes', icon: Sparkles, description: 'Custom themes' },
  { id: 'feedback' as const, label: 'Feedback', icon: Vibrate, description: 'Haptics & sounds' },
  { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Alerts' },
  { id: 'language' as const, label: 'Language', icon: Globe, description: 'App language' },
  { id: 'help' as const, label: 'Help', icon: HelpCircle, description: 'Support' },
  // Developer section only shown in dev mode
  ...(import.meta.env.DEV ? [{ id: 'developer' as const, label: 'Developer', icon: Code2, description: 'Dev tools' }] : []),
];

export function SettingsNav({ activeCategory, onCategoryChange }: SettingsNavProps) {
  return (
    <ScrollArea className="w-full">
      <nav className="flex gap-2 pb-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              haptics.tap();
              onCategoryChange(cat.id);
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200',
              'active:scale-95 border',
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25'
                : 'bg-card/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground hover:border-border'
            )}
          >
            <cat.icon className="w-4 h-4" />
            <span>{cat.label}</span>
          </button>
        ))}
      </nav>
      <ScrollBar orientation="horizontal" className="invisible" />
    </ScrollArea>
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
            'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200',
            'active:scale-[0.98] border',
            activeCategory === cat.id
              ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
              : 'bg-transparent border-transparent hover:bg-muted/50 text-foreground hover:border-border/50'
          )}
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
            activeCategory === cat.id
              ? 'bg-primary-foreground/20'
              : 'bg-muted'
          )}>
            <cat.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">{cat.label}</p>
            <p className={cn(
              'text-xs truncate',
              activeCategory === cat.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {cat.description}
            </p>
          </div>
        </button>
      ))}
    </nav>
  );
}
