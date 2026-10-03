import { createContext, useContext, useEffect, ReactNode } from 'react';
import { usePlatform, PlatformType, DeviceType, PerformanceTier } from '@/hooks/usePlatform';
import { applySafeAreaCssVars } from '@/lib/safeAreaInsets';
import { isSamsungFoldableUa } from '@/lib/deviceDetection';

interface PlatformContextValue {
  platform: PlatformType;
  device: DeviceType;
  performanceTier: PerformanceTier;
  supportsHover: boolean;
  supportsTouch: boolean;
  isStandalone: boolean;
  hasNotch: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  connectionType: 'slow' | 'fast' | 'offline' | 'unknown';
  isOnline: boolean;
  isLowPerformance: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const platformInfo = usePlatform();

  // Apply platform-specific classes to document
  useEffect(() => {
    const { platform, device, performanceTier, prefersReducedMotion, hasNotch } = platformInfo;
    const html = document.documentElement;
    const body = document.body;

    // Platform classes
    html.classList.remove('platform-ios', 'platform-android', 'platform-windows', 'platform-macos');
    html.classList.add(`platform-${platform}`);

    // Device classes
    html.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
    html.classList.add(`device-${device}`);
    // [Android-only] Galaxy Fold cover ↔ inner. Set before paint in index.html too.
    html.classList.toggle('device-fold', isSamsungFoldableUa());

    // Performance tier classes
    html.classList.remove('perf-low', 'perf-medium', 'perf-high');
    html.classList.add(`perf-${performanceTier}`);

    // Reduced motion
    if (prefersReducedMotion) {
      html.classList.add('reduce-motion');
    } else {
      html.classList.remove('reduce-motion');
    }

    // Notch support — avoid body padding-top; fixed header owns top safe area
    if (hasNotch) {
      html.classList.add('has-notch');
    } else {
      html.classList.remove('has-notch');
      body.classList.remove('safe-all');
    }

    const cleanupSafeArea = applySafeAreaCssVars(platform, device);

    return () => {
      cleanupSafeArea();
      html.classList.remove(
        `platform-${platform}`,
        `device-${device}`,
        `perf-${performanceTier}`,
        'device-fold',
        'reduce-motion',
        'has-notch'
      );
    };
  }, [platformInfo]);

  const value: PlatformContextValue = {
    ...platformInfo,
    isOnline: platformInfo.connectionType !== 'offline',
    isLowPerformance: platformInfo.performanceTier === 'low',
  };

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatformContext() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatformContext must be used within a PlatformProvider');
  }
  return context;
}

// HOC for platform-aware components
export function withPlatform<T extends object>(
  Component: React.ComponentType<T & PlatformContextValue>
) {
  return function WrappedComponent(props: T) {
    const platform = usePlatformContext();
    return <Component {...props} {...platform} />;
  };
}
