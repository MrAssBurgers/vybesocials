/**
 * Content Safety Scanner
 * 
 * Displays a scanning animation and handles content safety checks
 * Outcomes: Allow, Warn, Block
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SafetyResult = 'scanning' | 'allowed' | 'warned' | 'blocked';

interface ContentSafetyScannerProps {
  isScanning: boolean;
  result: SafetyResult;
  onContinue?: () => void;
  onCancel?: () => void;
  onAppeal?: () => void;
  message?: string;
}

export function ContentSafetyScanner({
  isScanning,
  result,
  onContinue,
  onCancel,
  onAppeal,
  message,
}: ContentSafetyScannerProps) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, [isScanning]);

  const getIcon = () => {
    switch (result) {
      case 'scanning':
        return <Loader2 className="h-16 w-16 text-primary animate-spin" />;
      case 'allowed':
        return <ShieldCheck className="h-16 w-16 text-green-500" />;
      case 'warned':
        return <ShieldAlert className="h-16 w-16 text-yellow-500" />;
      case 'blocked':
        return <ShieldX className="h-16 w-16 text-destructive" />;
      default:
        return <Shield className="h-16 w-16 text-muted-foreground" />;
    }
  };

  const getTitle = () => {
    switch (result) {
      case 'scanning':
        return `Checking Content Safety${'.'.repeat(dots)}`;
      case 'allowed':
        return 'Content Approved';
      case 'warned':
        return 'Content Warning';
      case 'blocked':
        return 'Content Blocked';
      default:
        return 'Content Safety';
    }
  };

  const getDescription = () => {
    if (message) return message;
    switch (result) {
      case 'scanning':
        return 'Ensuring your content meets our community guidelines';
      case 'allowed':
        return 'Your content is ready to share!';
      case 'warned':
        return 'This content may be sensitive. You can still proceed if you wish.';
      case 'blocked':
        return 'This content violates our community guidelines and cannot be posted.';
      default:
        return '';
    }
  };

  const getBgClass = () => {
    switch (result) {
      case 'allowed':
        return 'border-green-500/30 bg-green-500/5';
      case 'warned':
        return 'border-yellow-500/30 bg-yellow-500/5';
      case 'blocked':
        return 'border-destructive/30 bg-destructive/5';
      default:
        return 'border-border bg-card/50';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'rounded-2xl border-2 p-8 backdrop-blur-lg text-center space-y-6',
        getBgClass()
      )}
    >
      {/* Scanning animation */}
      <motion.div
        animate={isScanning ? { scale: [1, 1.1, 1] } : {}}
        transition={{ repeat: isScanning ? Infinity : 0, duration: 1.5 }}
        className="flex justify-center"
      >
        {getIcon()}
      </motion.div>

      {/* Title */}
      <h3 className="text-xl font-semibold">{getTitle()}</h3>

      {/* Description */}
      <p className="text-muted-foreground max-w-sm mx-auto">
        {getDescription()}
      </p>

      {/* Progress bar for scanning */}
      {isScanning && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, ease: 'linear' }}
          />
        </div>
      )}

      {/* Actions */}
      {!isScanning && (
        <div className="flex flex-col gap-3 pt-2">
          {result === 'allowed' && onContinue && (
            <Button onClick={onContinue} variant="gradient" className="w-full">
              Continue to Post
            </Button>
          )}

          {result === 'warned' && (
            <>
              <Button onClick={onContinue} variant="default" className="w-full">
                Post Anyway
              </Button>
              <Button onClick={onCancel} variant="outline" className="w-full">
                Edit Content
              </Button>
            </>
          )}

          {result === 'blocked' && (
            <>
              <Button onClick={onCancel} variant="default" className="w-full">
                Edit Content
              </Button>
              {onAppeal && (
                <Button onClick={onAppeal} variant="ghost" className="w-full text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Appeal This Decision
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
