/**
 * Camera Safety Gate
 * 
 * Fullscreen AI content scanner for camera-captured media.
 * Runs the scan and displays results before allowing share.
 */

import { useEffect } from 'react';
 import { useState } from 'react';
import { motion } from 'framer-motion';
import { useContentSafety, SafetyResult } from '@/hooks/useContentSafety';
import { ContentSafetyScanner } from '@/components/safety/ContentSafetyScanner';
 import { shouldBypassSafety } from '@/lib/ownerBypass';
 import { Crown } from 'lucide-react';

interface CameraSafetyGateProps {
  file: File;
  mediaType: 'photo' | 'video';
  onResult: (result: SafetyResult) => void;
  onCancel: () => void;
}

export function CameraSafetyGate({ file, mediaType, onResult, onCancel }: CameraSafetyGateProps) {
  const { isScanning, result, message, scanDetails, scanImage, scanVideo, reset } = useContentSafety();
   const [ownerBypass, setOwnerBypass] = useState(false);

  useEffect(() => {
    // Start scanning on mount
    const runScan = async () => {
       // Check owner bypass first
       const isOwner = await shouldBypassSafety();
       if (isOwner) {
         setOwnerBypass(true);
         // Auto-approve for owner
         setTimeout(() => {
           onResult('allowed');
         }, 300);
         return;
       }
 
      if (mediaType === 'video') {
        await scanVideo(file);
      } else {
        await scanImage(file);
      }
    };
    runScan();

    return () => reset();
  }, [file, mediaType, scanImage, scanVideo, reset]);

  const handleContinue = () => {
    onResult(result);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
    >
       {ownerBypass ? (
         <motion.div
           initial={{ scale: 0.9, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="flex flex-col items-center gap-4 text-center"
         >
           <motion.div
             className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center"
             initial={{ scale: 0 }}
             animate={{ scale: 1 }}
             transition={{ type: "spring", stiffness: 300, damping: 20 }}
           >
             <Crown className="h-10 w-10 text-primary" />
           </motion.div>
           <div>
             <h3 className="text-lg font-semibold text-primary">Owner Bypass Active</h3>
             <p className="text-sm text-muted-foreground">Skipping content scan...</p>
           </div>
         </motion.div>
       ) : (
      <ContentSafetyScanner
        isScanning={isScanning}
        result={result}
        message={message}
        scanDetails={scanDetails}
        onContinue={handleContinue}
        onCancel={handleCancel}
      />
       )}
    </motion.div>
  );
}
