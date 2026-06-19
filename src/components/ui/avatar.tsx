import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { transformedImage } from "@/lib/imageTransform";
import { getCachedProfileAvatar } from "@/lib/profileAvatarCache";

// Avatar with properly sized ring that matches the avatar container
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex shrink-0 overflow-hidden rounded-full",
      "h-10 w-10", // Default size - can be overridden
      className
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full",
      "bg-muted text-muted-foreground font-medium",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/** Avatar image that shows cached URL instantly while fresh URL loads. */
const ProfileAvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & {
    profileId?: string | null;
  }
>(({ profileId, src, className, ...props }, ref) => {
  const cached = profileId ? getCachedProfileAvatar(profileId) : null;
  const resolved = src || cached || undefined;
  const optimized = resolved ? transformedImage(resolved, { width: 128, height: 128 }) : undefined;
  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={optimized}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
});
ProfileAvatarImage.displayName = "ProfileAvatarImage";

export { Avatar, AvatarImage, AvatarFallback, ProfileAvatarImage };
