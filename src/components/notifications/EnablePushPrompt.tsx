import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Loader2 } from 'lucide-react';
import { useEnablePushPrompt } from '@/hooks/useEnablePushPrompt';

export function EnablePushPrompt() {
  const { open, onEnable, onDismiss, isLoading } = useEnablePushPrompt();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="max-w-sm bg-card border-border" data-vybe-optional-prompt="push">
        <DialogHeader className="items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mb-2">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-xl">Turn on notifications</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Get DMs, calls, and friend activity in real time. Tap Enable — your phone will ask for permission next. When you tap Allow, this device links to your VYBE account instantly.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <Button
            onClick={onEnable}
            disabled={isLoading}
            className="w-full active:scale-95 transition-transform"
            size="lg"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enable notifications'}
          </Button>
          <Button
            variant="ghost"
            onClick={onDismiss}
            disabled={isLoading}
            className="w-full"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
