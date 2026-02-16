import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Loader2, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendTip, TIP_AMOUNTS } from '@/hooks/useTipping';
import { cn } from '@/lib/utils';

interface TipButtonProps {
  creatorId: string;
  creatorName?: string;
  className?: string;
  variant?: 'icon' | 'full';
}

export function TipButton({ creatorId, creatorName, className, variant = 'icon' }: TipButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [showMessage, setShowMessage] = useState(false);
  const { sendTip, isLoading } = useSendTip();

  const amount = customAmount ? parseFloat(customAmount) : selectedAmount;
  const isValid = amount >= 1 && amount <= 500;

  const handleSend = async () => {
    if (!isValid) return;
    await sendTip(creatorId, amount, message || undefined);
    setIsOpen(false);
    setMessage('');
    setCustomAmount('');
  };

  if (variant === 'icon') {
    return (
      <>
        <Button
          size="icon"
          variant="ghost"
          className={cn("rounded-full h-9 w-9", className)}
          onClick={() => setIsOpen(true)}
        >
          <Heart className="h-4 w-4" />
        </Button>

        <AnimatePresence>
          {isOpen && (
            <TipModal
              creatorName={creatorName}
              selectedAmount={selectedAmount}
              customAmount={customAmount}
              message={message}
              showMessage={showMessage}
              isLoading={isLoading}
              isValid={isValid}
              amount={amount}
              onSelectAmount={(a) => { setSelectedAmount(a); setCustomAmount(''); }}
              onCustomAmount={setCustomAmount}
              onMessage={setMessage}
              onToggleMessage={() => setShowMessage(!showMessage)}
              onSend={handleSend}
              onClose={() => setIsOpen(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className={cn("rounded-xl gap-2", className)}
        onClick={() => setIsOpen(true)}
      >
        <Heart className="h-4 w-4" />
        Send Tip
      </Button>

      <AnimatePresence>
        {isOpen && (
          <TipModal
            creatorName={creatorName}
            selectedAmount={selectedAmount}
            customAmount={customAmount}
            message={message}
            showMessage={showMessage}
            isLoading={isLoading}
            isValid={isValid}
            amount={amount}
            onSelectAmount={(a) => { setSelectedAmount(a); setCustomAmount(''); }}
            onCustomAmount={setCustomAmount}
            onMessage={setMessage}
            onToggleMessage={() => setShowMessage(!showMessage)}
            onSend={handleSend}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function TipModal({
  creatorName, selectedAmount, customAmount, message, showMessage,
  isLoading, isValid, amount,
  onSelectAmount, onCustomAmount, onMessage, onToggleMessage, onSend, onClose,
}: {
  creatorName?: string;
  selectedAmount: number;
  customAmount: string;
  message: string;
  showMessage: boolean;
  isLoading: boolean;
  isValid: boolean;
  amount: number;
  onSelectAmount: (a: number) => void;
  onCustomAmount: (v: string) => void;
  onMessage: (v: string) => void;
  onToggleMessage: () => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full max-w-md bg-card rounded-t-3xl p-6 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Send a Tip</h3>
            {creatorName && (
              <p className="text-sm text-muted-foreground">to {creatorName}</p>
            )}
          </div>
          <Button size="icon" variant="ghost" className="rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Amount grid */}
        <div className="grid grid-cols-3 gap-2">
          {TIP_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => onSelectAmount(a)}
              className={cn(
                "py-3 rounded-xl text-sm font-semibold transition-all",
                !customAmount && selectedAmount === a
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              ${a}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
          <Input
            type="number"
            placeholder="Custom amount"
            value={customAmount}
            onChange={(e) => onCustomAmount(e.target.value)}
            className="pl-7 rounded-xl"
            min={1}
            max={500}
          />
        </div>

        {/* Optional message */}
        <div>
          <button
            onClick={onToggleMessage}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            {showMessage ? 'Hide message' : 'Add a message'}
          </button>
          <AnimatePresence>
            {showMessage && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <Input
                  placeholder="Say something nice..."
                  value={message}
                  onChange={(e) => onMessage(e.target.value)}
                  className="mt-2 rounded-xl"
                  maxLength={200}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Send button */}
        <Button
          className="w-full rounded-xl h-12 text-base"
          onClick={onSend}
          disabled={!isValid || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Heart className="h-5 w-5 mr-2" />
          )}
          {isValid ? `Tip $${amount.toFixed(2)}` : 'Enter amount ($1–$500)'}
        </Button>

        <p className="text-[10px] text-center text-muted-foreground">
          85% goes to the creator · Powered by Stripe
        </p>
      </motion.div>
    </motion.div>
  );
}
