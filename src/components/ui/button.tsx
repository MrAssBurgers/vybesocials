import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 liquid-glass-button",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input liquid-glass-subtle hover:bg-accent hover:text-accent-foreground",
        secondary: "liquid-glass-button text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        gradient: "vybe-liquid-button text-primary-foreground font-semibold",
        vybeLiquid:
          "vybe-liquid-button text-primary-foreground font-semibold",
        glass: "liquid-glass text-foreground hover:bg-muted/50",
        neon: "bg-primary text-primary-foreground glow-pink hover:glow-purple transition-shadow liquid-glass-button",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        xl: "h-14 rounded-2xl px-10 text-base",
        icon: "h-11 w-11 rounded-xl", // 44px — meets WCAG 2.5.5 tap target
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-12 w-12 rounded-xl",
        "icon-round": "h-11 w-11 rounded-full",
        "icon-round-sm": "h-9 w-9 rounded-full",
        "icon-round-lg": "h-12 w-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // Treat legacy `gradient-animated` className as the unified vybeLiquid look so every
    // CTA matches the login button animation.
    const classHasGradientAnimated =
      typeof className === "string" && className.includes("gradient-animated");
    const normalizedClassName =
      typeof className === "string" && classHasGradientAnimated
        ? className.replace(/\bgradient-animated\b/g, "vybe-liquid-button")
        : className;
    const isVybeLiquid =
      variant === "vybeLiquid" || variant === "gradient" || classHasGradientAnimated;
    const content =
      isVybeLiquid && !asChild ? (
        <>
          <span className="vybe-liquid-button__flow" aria-hidden />
          <span className="relative z-[2] inline-flex items-center justify-center gap-2">
            {children}
          </span>
        </>
      ) : (
        children
      );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), normalizedClassName)}
        ref={ref}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
