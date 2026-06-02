import { memo } from 'react';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';
import { VybeLiquidTouchOverlay } from '@/components/effects/VybeLiquidTouchOverlay';

/** App-shell touch only — auth Landing mounts its own overlay in-page. */
export const VybeLiquidTouchShell = memo(function VybeLiquidTouchShell() {
  const show = useDefaultLiquidBackground();
  if (!show) return null;
  return <VybeLiquidTouchOverlay />;
});
