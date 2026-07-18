import { memo, useEffect } from 'react';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';

interface SplashScreenProps {
  isVisible: boolean;
}

/**
 * Boot splash coordinator — #vybe-static-boot in index.html is the only visible
 * splash layer until App.tsx calls clearSplashDocumentLocks on dismiss.
 *
 * On Despia/native (`data-vybe-splash="native-handoff"`), that layer is an opaque
 * #09090b hold only — LaunchScreen / Despia already showed the branded splash.
 */
export const SplashScreen = memo(function SplashScreen({ isVisible }: SplashScreenProps) {
  useEffect(() => {
    if (!isVisible) {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
      ensureAppShellVisible();
      return;
    }

    document.body.style.overflow = 'hidden';
    document.body.classList.add('splash-visible');

    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
    };
  }, [isVisible]);

  return null;
});
