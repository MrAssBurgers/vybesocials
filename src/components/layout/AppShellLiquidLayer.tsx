import { memo, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { VybeLiquidBackground } from '@/components/effects/VybeLiquidBackground';

const AURORA_MOUNT_ID = 'vybe-aurora-mount';

interface AppShellLiquidLayerProps {
  show: boolean;
}

/**
 * Login aurora — portaled into #vybe-aurora-mount (body sibling behind #root)
 * so route motion transforms and opaque #root descendants cannot bury it.
 */
export const AppShellLiquidLayer = memo(function AppShellLiquidLayer({
  show,
}: AppShellLiquidLayerProps) {
  const shouldShow = show;
  const [mount] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined'
      ? document.getElementById(AURORA_MOUNT_ID)
      : null,
  );

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('vybe-aurora-active', shouldShow);
    return () => document.documentElement.classList.remove('vybe-aurora-active');
  }, [shouldShow]);

  if (!shouldShow || !mount) return null;

  return createPortal(
    <VybeLiquidBackground interactive backgroundOnly />,
    mount,
  );
});
