import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface OwnerWifeRingBadgeProps {
  className?: string;
}

// The owner's wife profile ID
const OWNER_WIFE_PROFILE_ID = 'bb086232-ce0d-4562-937e-eb51eb3589ab';

export function isOwnerWife(profileId: string | null | undefined): boolean {
  return profileId === OWNER_WIFE_PROFILE_ID;
}

/**
 * OwnerWifeRingBadge - Ring badge for the owner's wife
 * On mobile/tablet: Uses drop-shadow for visibility
 */
export function OwnerWifeRingBadge({ className }: OwnerWifeRingBadgeProps) {
  // Generate stable ID for mobile style injection
  const elementId = useMemo(() => `owner-wife-badge-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <>
            <span 
              id={elementId}
              className={cn(
                "inline-flex items-center justify-center relative w-7 h-7",
                className
              )}
            >
              {/* Burgundy gradient ring - static, elegant */}
              <span 
                className="absolute inset-0 rounded-full opacity-90"
                style={{ 
                  background: 'conic-gradient(from 0deg, hsl(345 60% 35%), hsl(330 70% 25%), hsl(350 65% 45%), hsl(345 60% 35%))',
                }} 
              />
              {/* Inner circle background */}
              <span className="absolute inset-[2px] rounded-full bg-background" />
              {/* Ring emoji with subtle shine */}
              <span 
                className="relative z-10 text-sm"
                style={{
                  filter: 'drop-shadow(0 0 2px hsla(345, 60%, 40%, 0.5))',
                }}
              >💍</span>
            </span>
          </>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Owner's Wife</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
