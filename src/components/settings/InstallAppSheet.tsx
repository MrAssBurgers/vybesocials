import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Download, Smartphone, Monitor, Apple } from 'lucide-react';
import { usePlatform } from '@/hooks/usePlatform';
import { useState, useEffect } from 'react';

interface InstallAppSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstallAppSheet({ open, onOpenChange }: InstallAppSheetProps) {
  const { platform, device } = usePlatform();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const isIOS = platform === 'ios';
  const isAndroid = platform === 'android';
  const isMobile = device === 'mobile' || device === 'tablet';

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for the beforeinstallprompt event (Chrome/Edge/Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="text-left pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Already Installed!
            </SheetTitle>
          </SheetHeader>
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
            <p className="text-sm text-center">
              🎉 VYBE is already installed on your device!
            </p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Install VYBE App
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Quick Install Button (Chrome/Edge/Android) */}
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="w-full p-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Download className="w-5 h-5" />
              Install Now
            </button>
          )}

          {/* iOS Instructions */}
          <div className="p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <Apple className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="font-semibold">iPhone & iPad</p>
                <p className="text-xs text-muted-foreground">Safari browser</p>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground ml-1">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Tap the <strong className="text-foreground">Share</strong> button (box with arrow) at the bottom of Safari</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Scroll down and tap <strong className="text-foreground">"Add to Home Screen"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Tap <strong className="text-foreground">"Add"</strong> in the top right corner</span>
              </li>
            </ol>
          </div>

          {/* Android Instructions */}
          <div className="p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="font-semibold">Android</p>
                <p className="text-xs text-muted-foreground">Chrome browser</p>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground ml-1">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Tap the <strong className="text-foreground">⋮ menu</strong> (three dots) in the top right</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Tap <strong className="text-foreground">"Add to Home screen"</strong> or <strong className="text-foreground">"Install app"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Tap <strong className="text-foreground">"Add"</strong> to confirm</span>
              </li>
            </ol>
          </div>

          {/* Desktop Instructions */}
          <div className="p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Desktop</p>
                <p className="text-xs text-muted-foreground">Chrome, Edge, or Brave</p>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground ml-1">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Look for the <strong className="text-foreground">install icon</strong> (⊕) in the address bar</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Or click <strong className="text-foreground">⋮ menu → "Install VYBE"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Click <strong className="text-foreground">"Install"</strong> to add to your apps</span>
              </li>
            </ol>
          </div>

          {/* Benefits */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20">
            <p className="font-medium text-sm mb-2">✨ Why install?</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Launch instantly from your home screen</li>
              <li>• Works offline for browsing cached content</li>
              <li>• Full-screen experience without browser UI</li>
              <li>• Faster loading with your custom theme</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
