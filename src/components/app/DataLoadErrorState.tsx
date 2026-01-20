/**
 * Data Load Error State
 * 
 * Shows a friendly error message when data fails to load,
 * with a retry button. Does NOT log the user out.
 */

import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface DataLoadErrorStateProps {
  error: string | null;
  onRetry: () => void;
  onContinue?: () => void;
}

export function DataLoadErrorState({ error, onRetry, onContinue }: DataLoadErrorStateProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-sm"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-destructive" />
        </div>
        
        <h2 className="text-xl font-semibold mb-2">Connection Issue</h2>
        <p className="text-muted-foreground mb-6">
          {error || "We couldn't load your data. This might be a temporary issue."}
        </p>

        <div className="space-y-3">
          <Button onClick={onRetry} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          
          {onContinue && (
            <Button variant="ghost" onClick={onContinue} className="w-full">
              Continue Anyway
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          You're still logged in. Your session is safe.
        </p>
      </motion.div>
    </div>
  );
}
