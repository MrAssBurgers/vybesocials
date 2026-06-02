/**
 * Default immersive background when the user has no custom wallpaper.
 * Custom uploads / equipped theme images (AppBackgroundProvider) always win.
 */

import { memo } from 'react';
import { VybeLiquidBackground } from '@/components/effects/VybeLiquidBackground';
import { useAppShellLiquidBackground } from '@/hooks/useLiquidBackgroundShell';

export const AppLiquidBackground = memo(function AppLiquidBackground() {
  const show = useAppShellLiquidBackground();
  if (!show) return null;
  return <VybeLiquidBackground interactive />;
});
