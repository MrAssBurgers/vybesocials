import { Crown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OwnerBadgeProps {
  className?: string;
}

// The owner username - MrAssBurgers
const OWNER_USERNAME = 'mrassburgers';

export function isOwner(username: string | null | undefined): boolean {
  return username?.trim().toLowerCase() === OWNER_USERNAME.toLowerCase();
}

export function OwnerBadge({ className }: OwnerBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center", className)}>
            <Crown className="h-4 w-4 text-primary fill-primary/30" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Owner</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
