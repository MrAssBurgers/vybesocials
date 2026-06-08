import { memo } from 'react';
import { useDefaultLiquidBackground, useLiquidTouchActive } from '@/hooks/useDefaultLiquidBackground';
import { VybeLiquidTouchOverlay } from '@/components/effects/VybeLiquidTouchOverlay';

/** App-shell touch only — auth Landing mounts its own overlay in-page. */
export const VybeLiquidTouchShell = memo(function VybeLiquidTouchShell() {
  const showApp = useDefaultLiquidBackground();
  const touchActive = useLiquidTouchActive();
  if (!showApp || !touchActive) return null;
  return <VybeLiquidTouchOverlay />;
});
