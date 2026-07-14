import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { transformedImage } from "@/lib/imageTransform";
import { resolveProfileAvatarUrl } from "@/lib/profileAvatarCache";
import { useFastSignedUrl } from "@/hooks/useFastSignedUrl";
import { batchSignUrls, getCachedSignedUrl, needsSigning } from "@/lib/signedUrlCache";
import { normalizeMediaUrl } from "@/lib/mediaUrl";

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
>(({ className, src, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    src={src}
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
      "bg-secondary/80 text-secondary-foreground font-medium",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/** Avatar image — resolves cached URL, signs storage URLs, optimizes size. */
const ProfileAvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & {
    profileId?: string | null;
    /** Optional explicit size for storage transforms (default 128). */
    transformSize?: number;
    /** Above-fold avatars — eager decode, no lazy delay */
    priority?: boolean;
  }
>(({ profileId, src, className, transformSize = 128, priority = false, ...props }, ref) => {
  const resolved = React.useMemo(
    () => resolveProfileAvatarUrl(profileId, src),
    [profileId, src],
  );
  const signed = useFastSignedUrl(resolved);
  const normalized = normalizeMediaUrl(resolved);
  const displayRaw =
    signed ||
    (normalized && !needsSigning(normalized) ? normalized : getCachedSignedUrl(normalized) || normalized);
  const optimized = React.useMemo(
    () =>
      displayRaw
        ? transformedImage(displayRaw, { width: transformSize, height: transformSize, quality: 82 })
        : undefined,
    [displayRaw, transformSize],
  );

  React.useEffect(() => {
    if (resolved) batchSignUrls([resolved]).catch(() => {});
  }, [resolved]);

  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={optimized}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
      fetchpriority={priority ? 'high' : 'auto'}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
});
ProfileAvatarImage.displayName = "ProfileAvatarImage";

export { Avatar, AvatarImage, AvatarFallback, ProfileAvatarImage };
