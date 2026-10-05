import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, style, forceMount, align = "center", sideOffset = 4, side = "top", ...props }, ref) => (
  // Feed cards create clipping and stacking contexts. A viewport-positioned
  // preview must leave those ancestors for collision handling to work.
  <HoverCardPrimitive.Portal forceMount={forceMount}>
    <HoverCardPrimitive.Content
      ref={ref}
      forceMount={forceMount}
      align={align}
      side={side}
      sideOffset={sideOffset}
      avoidCollisions
      collisionPadding={16}
      sticky="always"
      hideWhenDetached
      className={cn(
        "z-[9999] w-64 rounded-xl liquid-glass p-4 text-popover-foreground shadow-xl outline-none",
        className,
      )}
      style={{
        maxWidth: "var(--radix-hover-card-content-available-width)",
        maxHeight: "var(--radix-hover-card-content-available-height)",
        overflowY: "auto",
        overscrollBehavior: "contain",
        ...style,
      }}
      {...props}
    />
  </HoverCardPrimitive.Portal>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
