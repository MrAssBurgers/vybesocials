import { memo } from "react";
import { BottomNav } from "./BottomNav";
import { useBottomNavMount } from "@/hooks/useBottomNavMount";
import { useRecoverBottomNavOnTabEnter } from "@/hooks/useRecoverBottomNavOnTabEnter";
import { useAuth } from "@/lib/auth";

/**
 * Mounts BottomNav only on primary tab routes (Instagram-style).
 * Scroll, keyboard, and immersive overlays still hide it via navVisibility.
 */
export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { user, profile } = useAuth();
  const showNav = useBottomNavMount();

  useRecoverBottomNavOnTabEnter(profile);

  // Guest entry screens own their sign-in actions; floating tabs obscure them on short displays.
  if (!user || !showNav) return null;
  return <BottomNav />;
});
