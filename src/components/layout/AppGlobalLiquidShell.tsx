import { memo } from 'react';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';
import { useLiquidBackgroundShell } from '@/hooks/useLiquidBackgroundShell';
import { AppShellLiquidLayer } from '@/components/layout/AppShellLiquidLayer';

/** Single app-wide login aurora — mount once inside BrowserRouter. */
export const AppGlobalLiquidShell = memo(function AppGlobalLiquidShell() {
  const show = useDefaultLiquidBackground();
  useLiquidBackgroundShell(show);
  return <AppShellLiquidLayer show={show} />;
});
