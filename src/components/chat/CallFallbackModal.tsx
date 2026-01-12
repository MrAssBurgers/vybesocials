import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mic, ExternalLink, X, WifiOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type FallbackOption = 'phone' | 'audio-only' | 'external' | 'cancel';

interface CallFallbackModalProps {
  open: boolean;
  onClose: () => void;
  onSelectOption: (option: FallbackOption) => void;
  failureCount: number;
  otherUserName?: string;
  otherUserPhone?: string | null;
}

export function CallFallbackModal({
  open,
  onClose,
  onSelectOption,
  failureCount,
  otherUserName = 'User',
  otherUserPhone,
}: CallFallbackModalProps) {
  const [isLoading, setIsLoading] = useState<FallbackOption | null>(null);

  const handleSelect = async (option: FallbackOption) => {
    if (option === 'cancel') {
      onClose();
      return;
    }
    
    setIsLoading(option);
    onSelectOption(option);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-500/10">
              <WifiOff className="w-5 h-5 text-amber-500" />
            </div>
            <DialogTitle className="text-lg">
              Call couldn't connect on this network
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            {failureCount >= 2 
              ? "Your network may be blocking video calls (common on school/work Wi-Fi). Try one of these alternatives:"
              : "The call failed to connect. This might be a temporary issue or a network restriction."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {/* Phone Call Option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-4"
            onClick={() => handleSelect('phone')}
            disabled={isLoading !== null}
          >
            <div className="p-2 rounded-full bg-green-500/10">
              <Phone className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-left flex-1">
              <div className="font-medium">Call via Phone</div>
              <div className="text-xs text-muted-foreground">
                {otherUserPhone 
                  ? "Connect through a regular phone call"
                  : "Requires phone number verification in Settings"}
              </div>
            </div>
            {!otherUserPhone && (
              <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded">
                Setup needed
              </span>
            )}
          </Button>

          {/* Audio Only Option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-4"
            onClick={() => handleSelect('audio-only')}
            disabled={isLoading !== null}
          >
            <div className="p-2 rounded-full bg-blue-500/10">
              <Mic className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-left flex-1">
              <div className="font-medium">Try audio-only mode</div>
              <div className="text-xs text-muted-foreground">
                Disabling video may help on slow networks
              </div>
            </div>
          </Button>

          {/* External App Option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-4"
            onClick={() => handleSelect('external')}
            disabled={isLoading !== null}
          >
            <div className="p-2 rounded-full bg-purple-500/10">
              <ExternalLink className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-left flex-1">
              <div className="font-medium">Open external call app</div>
              <div className="text-xs text-muted-foreground">
                Use FaceTime, Google Meet, or phone dialer
              </div>
            </div>
          </Button>

          {/* Cancel */}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => handleSelect('cancel')}
            disabled={isLoading !== null}
          >
            Cancel
          </Button>
        </div>

        {/* Network info */}
        <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            School and work networks often block video calls for security reasons. 
            This is normal and not a problem with the app.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
