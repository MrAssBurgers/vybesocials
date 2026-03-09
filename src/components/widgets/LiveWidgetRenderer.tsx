import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, CloudSun, Music, Flame, Coins, Heart, Users, Edit3, TrendingUp, Timer, X, GripVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveWidget, WidgetType, WIDGET_CATALOG } from '@/hooks/useLiveWidgets';
import { useTokenBalance } from '@/hooks/useVybeTokens';
import { useMoodTheme, MOOD_THEMES } from '@/hooks/useMoodMorphing';
import { cn } from '@/lib/utils';

// Clock Widget
function ClockWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-5 h-5 text-primary" />
      <span className="text-2xl font-bold tabular-nums">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

// Token Balance Widget
function TokenBalanceWidget() {
  const { data: balance } = useTokenBalance();
  
  return (
    <div className="flex items-center gap-2">
      <Coins className="w-5 h-5 text-yellow-500" />
      <span className="text-xl font-bold">{balance?.balance || 0}</span>
      <span className="text-xs text-muted-foreground">VYBE</span>
    </div>
  );
}

// Mood Ring Widget
function MoodRingWidget() {
  const { mood, theme } = useMoodTheme();
  
  return (
    <div className="flex items-center gap-3">
      <motion.div
        className={cn("w-10 h-10 rounded-full", `bg-gradient-to-br ${theme.gradient}`)}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <div>
        <span className="text-lg">{MOOD_THEMES[mood].emoji}</span>
        <p className="text-xs text-muted-foreground capitalize">{mood}</p>
      </div>
    </div>
  );
}

// Streak Widget (placeholder)
function StreakWidget() {
  return (
    <div className="flex items-center gap-2">
      <Flame className="w-5 h-5 text-orange-500" />
      <span className="text-xl font-bold">7</span>
      <span className="text-xs text-muted-foreground">day streak</span>
    </div>
  );
}

// Generic placeholder widget
function PlaceholderWidget({ type }: { type: WidgetType }) {
  const catalog = WIDGET_CATALOG[type];
  
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="text-2xl">{catalog.icon}</span>
      <span className="text-sm">{catalog.label}</span>
    </div>
  );
}

// Widget content router
function WidgetContent({ widget }: { widget: LiveWidget }) {
  switch (widget.widget_type) {
    case 'clock':
      return <ClockWidget />;
    case 'token_balance':
      return <TokenBalanceWidget />;
    case 'mood_ring':
      return <MoodRingWidget />;
    case 'streak_counter':
      return <StreakWidget />;
    default:
      return <PlaceholderWidget type={widget.widget_type} />;
  }
}

interface LiveWidgetRendererProps {
  widget: LiveWidget;
  onRemove?: (id: string) => void;
  isEditing?: boolean;
}

export function LiveWidgetRenderer({ widget, onRemove, isEditing }: LiveWidgetRendererProps) {
  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-2',
    large: 'col-span-3',
  };

  if (!widget.is_visible && !isEditing) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: widget.is_visible ? 1 : 0.5, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(sizeClasses[widget.size], 'relative')}
    >
      <Card className={cn(
        "h-full transition-all",
        isEditing && "ring-2 ring-primary/50 ring-dashed"
      )}>
        <CardContent className="p-4 flex items-center justify-center h-full min-h-[60px]">
          <WidgetContent widget={widget} />
          
          {isEditing && (
            <>
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 w-6 h-6"
                onClick={() => onRemove?.(widget.id)}
              >
                <X className="w-3 h-3" />
              </Button>
              <div className="absolute top-1 left-1 cursor-grab">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface LiveWidgetGridProps {
  widgets: LiveWidget[];
  onRemove?: (id: string) => void;
  isEditing?: boolean;
}

export function LiveWidgetGrid({ widgets, onRemove, isEditing }: LiveWidgetGridProps) {
  const visibleWidgets = isEditing ? widgets : widgets.filter(w => w.is_visible);

  if (visibleWidgets.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {visibleWidgets.map(widget => (
        <LiveWidgetRenderer 
          key={widget.id} 
          widget={widget} 
          onRemove={onRemove}
          isEditing={isEditing}
        />
      ))}
    </div>
  );
}
