import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /** Enable horizontal scrolling */
  horizontal?: boolean;
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, horizontal = false, ...props }, ref) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);

  // Mouse-wheel → horizontal scroll for horizontal ScrollAreas
  React.useEffect(() => {
    if (!horizontal) return;
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;

      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if (e.deltaY < 0 && atLeft) return;
      if (e.deltaY > 0 && atRight) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [horizontal]);

  return (
    <ScrollAreaPrimitive.Root 
      ref={ref} 
      className={cn("relative overflow-hidden", className)} 
      {...props}
    >
      <ScrollAreaPrimitive.Viewport 
        ref={viewportRef}
        className="h-full w-full rounded-[inherit] [&>div]:!block"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          scrollBehavior: 'smooth',
          overflowX: horizontal ? 'auto' : 'hidden',
          overflowY: horizontal ? 'hidden' : 'auto',
        }}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation={horizontal ? "horizontal" : "vertical"} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-all duration-200",
      orientation === "vertical" && "h-full w-2 border-l border-l-transparent p-[1px] hover:w-2.5",
      orientation === "horizontal" && "h-2 flex-col border-t border-t-transparent p-[1px] hover:h-2.5",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-foreground/20 hover:bg-foreground/30 transition-colors" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
