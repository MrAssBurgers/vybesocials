import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, onCheckedChange, ...props }, ref) => {
  const [bounce, setBounce] = React.useState(false);

  const handleChange = React.useCallback(
    (val: boolean) => {
      setBounce(true);
      onCheckedChange?.(val);
      setTimeout(() => setBounce(false), 300);
    },
    [onCheckedChange]
  );

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted/60",
        "touch-manipulation",
        className,
      )}
      data-themed-svg="true"
      style={{
        WebkitAppearance: "none",
        MozAppearance: "none",
        appearance: "none",
        WebkitTapHighlightColor: "transparent",
        transition: "background-color 200ms ease-out",
        width: 50,
        minWidth: 50,
        maxWidth: 50,
        height: 28,
        minHeight: 28,
        maxHeight: 28,
        padding: 0,
        fontSize: 0,
        lineHeight: 0,
        overflow: "hidden",
        position: "relative",
        contain: "layout style paint",
      }}
      checked={checked}
      onCheckedChange={handleChange}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block rounded-full ring-0 will-change-transform"
        style={{
          width: 22,
          minWidth: 22,
          maxWidth: 22,
          height: 22,
          minHeight: 22,
          maxHeight: 22,
          backgroundColor: "white",
          transform: `translateX(${checked ? 22 : 2}px) scale(${bounce ? 1.12 : 1})`,
          transition: "transform 250ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: checked
            ? "0 0 8px hsla(var(--primary) / 0.4), 0 1px 3px rgba(0,0,0,0.2)"
            : "0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.14)",
          WebkitTransform: `translateX(${checked ? 22 : 2}px) scale(${bounce ? 1.12 : 1}) translateZ(0)`,
          fontSize: 0,
          lineHeight: 0,
          overflow: "hidden",
        }}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
