import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PrincessBadgeProps {
  className?: string;
}

// The owner's wife profile ID
const OWNER_WIFE_PROFILE_ID = 'bb086232-ce0d-4562-937e-eb51eb3589ab';

export function isOwnerWife(profileId: string | null | undefined): boolean {
  return profileId === OWNER_WIFE_PROFILE_ID;
}

export function PrincessBadge({ className }: PrincessBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center text-base", className)}>
            👸
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Owner's Wife</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
