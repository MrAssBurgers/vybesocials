import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  resolveExternalLinkPrompt,
  subscribeExternalLinkPrompt,
  type ExternalLinkRequest,
} from '@/lib/externalLinkGuard';

export function ExternalLinkConfirmDialog() {
  const [request, setRequest] = useState<ExternalLinkRequest | null>(null);
  const [neverAsk, setNeverAsk] = useState(false);

  useEffect(() => subscribeExternalLinkPrompt(setRequest), []);

  const open = request != null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resolveExternalLinkPrompt(false);
      }}
    >
      <DialogContent className="max-w-sm w-[min(92vw,24rem)]">
        <DialogHeader>
          <DialogTitle className="text-center">Leave VYBE?</DialogTitle>
          <DialogDescription className="text-center">
            You&apos;re about to go to{' '}
            <span className="font-semibold text-foreground">{request?.host || 'an external site'}</span>.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Checkbox checked={neverAsk} onCheckedChange={(v) => setNeverAsk(v === true)} />
          Never ask me again
        </label>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => resolveExternalLinkPrompt(true, neverAsk)}>
            Continue
          </Button>
          <Button className="w-full" variant="outline" onClick={() => resolveExternalLinkPrompt(false)}>
            Don&apos;t go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
