import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OwnerWifeRingBadgeProps {
  className?: string;
}

// The owner's wife profile ID
const OWNER_WIFE_PROFILE_ID = 'bb086232-ce0d-4562-937e-eb51eb3589ab';

export function isOwnerWife(profileId: string | null | undefined): boolean {
  return profileId === OWNER_WIFE_PROFILE_ID;
}

export function OwnerWifeRingBadge({ className }: OwnerWifeRingBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            className={cn(
              "inline-flex items-center justify-center relative w-7 h-7",
              className
            )}
          >
            {/* Animated gradient ring */}
            <span 
              className="absolute inset-0 rounded-full animate-spin opacity-90"
              style={{ 
                background: 'conic-gradient(from 0deg, hsl(var(--neon-pink)), hsl(var(--neon-purple)), hsl(var(--neon-pink)))',
                animationDuration: '3s',
              }} 
            />
            {/* Inner circle background */}
            <span className="absolute inset-[2px] rounded-full bg-background" />
            {/* Ring emoji */}
            <span className="relative z-10 text-sm">💍</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Owner's Wife</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
