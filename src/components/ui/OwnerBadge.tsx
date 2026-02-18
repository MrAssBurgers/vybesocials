import { Crown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface OwnerBadgeProps {
  className?: string;
}

// The owner username - MrAssBurgers
const OWNER_USERNAME = 'mrassburgers';

export function isOwner(username: string | null | undefined): boolean {
  return username?.trim().toLowerCase() === OWNER_USERNAME.toLowerCase();
}

/**
 * OwnerBadge - Crown badge for the app owner
 * On mobile/tablet: Uses drop-shadow for visibility
 */
export function OwnerBadge({ className }: OwnerBadgeProps) {
  // Generate stable ID for mobile style injection
  const elementId = useMemo(() => `owner-badge-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <>
            <span id={elementId} className={cn("inline-flex items-center", className)}>
              <Crown className="h-4 w-4 text-primary fill-primary/30" />
            </span>
          </>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Owner</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
