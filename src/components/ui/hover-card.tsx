import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, side = "top", ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    side={side}
    sideOffset={sideOffset}
    avoidCollisions
    collisionPadding={16}
    sticky="always"
    className={cn(
      "z-[9999] w-64 rounded-xl liquid-glass p-4 text-popover-foreground shadow-xl outline-none",
      className,
    )}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
