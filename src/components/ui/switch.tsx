import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted/60",
      // Smooth transition for the track color with spring-like timing
      "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
      // Scale effect on interaction
      "active:scale-95",
      // iOS Safari fix - ensure proper rendering
      "touch-manipulation appearance-none",
      className,
    )}
    style={{
      WebkitAppearance: 'none',
      WebkitTapHighlightColor: 'transparent',
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0",
        // Spring-like sliding animation for the thumb
        "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        // Scale bounce on state change
        "data-[state=checked]:scale-110 data-[state=unchecked]:scale-100",
        // Add glow effect when checked
        "data-[state=checked]:shadow-[0_0_8px_rgba(var(--primary),0.5),0_2px_8px_rgba(0,0,0,0.15)]",
        "data-[state=unchecked]:shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
        // iOS Safari fix - force hardware acceleration
        "will-change-transform",
      )}
      style={{
        WebkitTransform: 'translateZ(0)',
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
