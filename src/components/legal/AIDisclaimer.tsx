import { Bot, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIDisclaimerProps {
  variant?: 'inline' | 'card' | 'compact';
  className?: string;
}

export function AIDisclaimer({ variant = 'inline', className }: AIDisclaimerProps) {
  const text = 'AI analysis is probabilistic and not guaranteed. Results do not constitute legal or factual determinations. You remain responsible for all content you post.';

  if (variant === 'compact') {
    return (
      <p className={cn('text-xs text-muted-foreground flex items-start gap-1.5', className)}>
        <Bot className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
        <span>AI-assisted · Results are not guaranteed</span>
      </p>
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn('rounded-lg border border-border bg-muted/30 p-3 flex gap-3', className)}>
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
      </div>
    );
  }

  return (
    <p className={cn('text-xs text-muted-foreground/70 leading-relaxed', className)}>
      <Bot className="h-3 w-3 inline mr-1 -mt-0.5" />
      {text}
    </p>
  );
}
