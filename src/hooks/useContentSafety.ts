/**
 * Content Safety Hook
 * 
 * Uses client-side NSFWJS for image/video scanning (no API dependency).
 * Text scanning uses keyword-based detection.
 * Fully standalone - works without any external services.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { shouldBypassSafety } from '@/lib/ownerBypass';
import { scanImage as nsfwScanImage, scanVideo as nsfwScanVideo, scanText as nsfwScanText, type ScanResult } from '@/lib/nsfwScanner';

export type SafetyResult = 'scanning' | 'allowed' | 'warned' | 'blocked' | 'error';

interface SafetyCheckResult {
  result: SafetyResult;
  message?: string;
  categories?: string[];
  score?: number;
  audioTranscript?: string;
  visualAnalysis?: string;
  audioAnalysis?: string;
}

export function useContentSafety() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<SafetyResult>('scanning');
  const [message, setMessage] = useState<string>('');
  const [scanDetails, setScanDetails] = useState<{
    audioTranscript?: string;
    visualAnalysis?: string;
    audioAnalysis?: string;
  }>({});
  const [bypassEnabled, setBypassEnabled] = useState(false);

  const scanImage = useCallback(async (file: File): Promise<SafetyCheckResult> => {
    const isOwner = await shouldBypassSafety();
    if (isOwner) {
      setBypassEnabled(true);
      setResult('allowed');
      setMessage('Owner bypass active - no scan required');
      return { result: 'allowed', message: 'Owner bypass active' };
    }

    setIsScanning(true);
    setResult('scanning');
    setMessage('Scanning image...');
    setScanDetails({});

    try {
      const scanResult: ScanResult = await nsfwScanImage(file);

      const safetyResult: SafetyCheckResult = {
        result: scanResult.result,
        message: scanResult.message,
        categories: scanResult.categories,
        score: scanResult.score,
      };

      setResult(safetyResult.result);
      setMessage(safetyResult.message || '');
      return safetyResult;
    } catch (err: any) {
      console.error('Safety scan error:', err);
      const errorMessage = 'Safety scan failed. For your protection, this content cannot be shared. Please try again.';
      setResult('error');
      setMessage(errorMessage);
      return { result: 'error', message: errorMessage };
    } finally {
      setIsScanning(false);
    }
  }, []);

  const scanVideo = useCallback(async (file: File): Promise<SafetyCheckResult> => {
    const isOwner = await shouldBypassSafety();
    if (isOwner) {
      setBypassEnabled(true);
      setResult('allowed');
      setMessage('Owner bypass active - no scan required');
      return { result: 'allowed', message: 'Owner bypass active' };
    }

    setIsScanning(true);
    setResult('scanning');
    setMessage('Analyzing video frames...');
    setScanDetails({});

    try {
      const scanResult: ScanResult = await nsfwScanVideo(file);

      const safetyResult: SafetyCheckResult = {
        result: scanResult.result,
        message: scanResult.message,
        categories: scanResult.categories,
        score: scanResult.score,
      };

      setResult(safetyResult.result);
      setMessage(safetyResult.message || '');
      return safetyResult;
    } catch (err: any) {
      console.error('Video safety scan error:', err);
      const errorMessage = 'Video safety scan failed. For your protection, this content cannot be shared. Please try again.';
      setResult('error');
      setMessage(errorMessage);
      return { result: 'error', message: errorMessage };
    } finally {
      setIsScanning(false);
    }
  }, []);

  const scanText = useCallback(async (text: string): Promise<SafetyCheckResult> => {
    const isOwner = await shouldBypassSafety();
    if (isOwner) {
      setBypassEnabled(true);
      setResult('allowed');
      setMessage('Owner bypass active');
      return { result: 'allowed', message: 'Owner bypass active' };
    }

    setIsScanning(true);
    setResult('scanning');
    setMessage('');
    setScanDetails({});

    try {
      const scanResult: ScanResult = nsfwScanText(text);

      const safetyResult: SafetyCheckResult = {
        result: scanResult.result,
        message: scanResult.message,
        categories: scanResult.categories,
        score: scanResult.score,
      };

      setResult(safetyResult.result);
      setMessage(safetyResult.message || '');
      return safetyResult;
    } catch (err: any) {
      console.error('Safety scan error:', err);
      const errorMessage = 'Text safety scan failed. Please try again.';
      setResult('error');
      setMessage(errorMessage);
      return { result: 'error', message: errorMessage };
    } finally {
      setIsScanning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsScanning(false);
    setResult('scanning');
    setMessage('');
    setScanDetails({});
    setBypassEnabled(false);
  }, []);

  const submitAppeal = useCallback(async (contentType: 'image' | 'text' | 'video' | 'post' | 'ban', reason: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to submit an appeal');
        return false;
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
        
      if (!profile) {
        toast.error('Profile not found');
        return false;
      }

      const { error } = await supabase.from('content_appeals').insert({
        user_id: profile.id,
        content_type: contentType,
        reason,
      });
      
      if (error) throw error;
      
      toast.success('Appeal submitted. We will review your request.');
      return true;
    } catch (err) {
      console.error('Appeal error:', err);
      toast.error('Failed to submit appeal');
      return false;
    }
  }, []);

  return {
    isScanning,
    result,
    message,
    scanDetails,
    bypassEnabled,
    scanImage,
    scanVideo,
    scanText,
    reset,
    submitAppeal,
  };
}
