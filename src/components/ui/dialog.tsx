import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onEscapeKeyDown, onPointerDownOutside, style, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Flex shell centers without transform — bubble-pop scale cannot unpin the dialog. */}
    <div
      className="vybe-dialog-center-shell fixed inset-0 z-[151] flex items-center justify-center pointer-events-none"
      style={{
        paddingTop: 'max(0.75rem, var(--sat, env(safe-area-inset-top, 0px)))',
        paddingBottom: 'max(0.75rem, var(--sab, env(safe-area-inset-bottom, 0px)))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <DialogPrimitive.Content
        ref={ref}
        onEscapeKeyDown={(e) => {
          onEscapeKeyDown?.(e);
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e);
          e.preventDefault();
        }}
        className={cn(
          "vybe-dialog-panel relative pointer-events-auto z-[151]",
          "w-[90vw] max-w-lg h-fit",
          "max-h-[min(85vh,calc(100dvh-var(--sat,env(safe-area-inset-top,0px))-var(--sab,env(safe-area-inset-bottom,0px))-2rem))]",
          "bg-background/95 backdrop-blur-xl",
          "border border-border/50",
          "overflow-hidden rounded-2xl md:rounded-3xl",
          "shadow-2xl shadow-black/20",
          "data-[state=open]:animate-bubble-pop-in data-[state=closed]:animate-bubble-pop-out",
          className,
        )}
        style={style}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
        <div className="p-6 overflow-y-auto max-h-[85vh]">
          {children}
        </div>
        <DialogPrimitive.Close
          className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-full bg-muted/80 flex items-center justify-center opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10"
          style={{ width: 28, height: 28, minWidth: 28, minHeight: 28 }}
        >
          <X style={{ width: 14, height: 14 }} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
));
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
));
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
