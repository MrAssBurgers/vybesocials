import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, onCheckedChange, ...props }, ref) => {
  const [animate, setAnimate] = React.useState(false);

  const handleChange = React.useCallback(
    (val: boolean) => {
      setAnimate(true);
      onCheckedChange?.(val);
      setTimeout(() => setAnimate(false), 350);
    },
    [onCheckedChange]
  );

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Track color transition
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted/60",
        "transition-colors duration-200 ease-out",
        // Press feedback
        "active:scale-[0.96] transition-transform",
        // iOS fixes
        "touch-manipulation appearance-none",
        className,
      )}
      style={{
        WebkitAppearance: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      checked={checked}
      onCheckedChange={handleChange}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white ring-0",
          // Size
          "h-[22px] w-[22px]",
          // Slide animation - the core movement
          "data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          // Shadow
          "shadow-[0_1px_3px_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.14)]",
          // Bounce scale on toggle
          animate && "scale-[1.15]",
          !animate && "scale-100",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          // Hardware acceleration
          "will-change-transform",
        )}
        style={{
          WebkitTransform: "translateZ(0)",
          // Glow when checked
          boxShadow: props["data-state"] === "checked" || checked
            ? "0 0 8px hsla(var(--primary) / 0.4), 0 1px 3px rgba(0,0,0,0.2)"
            : "0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.14)",
        }}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
