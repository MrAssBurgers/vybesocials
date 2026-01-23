/**
 * Camera Safety Gate
 * 
 * Fullscreen AI content scanner for camera-captured media.
 * Runs the scan and displays results before allowing share.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useContentSafety, SafetyResult } from '@/hooks/useContentSafety';
import { ContentSafetyScanner } from '@/components/safety/ContentSafetyScanner';

interface CameraSafetyGateProps {
  file: File;
  mediaType: 'photo' | 'video';
  onResult: (result: SafetyResult) => void;
  onCancel: () => void;
}

export function CameraSafetyGate({ file, mediaType, onResult, onCancel }: CameraSafetyGateProps) {
  const { isScanning, result, message, scanDetails, scanImage, scanVideo, reset } = useContentSafety();

  useEffect(() => {
    // Start scanning on mount
    const runScan = async () => {
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
      <ContentSafetyScanner
        isScanning={isScanning}
        result={result}
        message={message}
        scanDetails={scanDetails}
        onContinue={handleContinue}
        onCancel={handleCancel}
      />
    </motion.div>
  );
}
