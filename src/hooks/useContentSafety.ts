/**
 * Content Safety Hook
 * 
 * Handles image, text, and video safety scanning via AI
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
 import { isCurrentUserOwner } from '@/lib/ownerBypass';

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
     // Check owner bypass
     const isOwner = await isCurrentUserOwner();
     if (isOwner) {
       setBypassEnabled(true);
       setResult('allowed');
       setMessage('Owner bypass active - no scan required');
       return { result: 'allowed', message: 'Owner bypass active' };
     }
 
    setIsScanning(true);
    setResult('scanning');
    setMessage('');
    setScanDetails({});

    try {
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('scan-content-safety', {
        body: {
          type: 'image',
          content: base64,
          fileName: file.name,
        },
      });

      if (error) throw error;

      const safetyResult: SafetyCheckResult = {
        result: data.result || 'allowed',
        message: data.message,
        categories: data.categories,
        score: data.score,
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
     // Check owner bypass
     const isOwner = await isCurrentUserOwner();
     if (isOwner) {
       setBypassEnabled(true);
       setResult('allowed');
       setMessage('Owner bypass active - no scan required');
       return { result: 'allowed', message: 'Owner bypass active' };
     }
 
    setIsScanning(true);
    setResult('scanning');
    setMessage('Analyzing video content and audio...');
    setScanDetails({});

    try {
      // For large videos, we need to be careful about size limits
      // The AI can handle videos up to ~20MB in base64
      const maxSize = 20 * 1024 * 1024; // 20MB
      
      if (file.size > maxSize) {
        console.warn('Video too large for full analysis, sampling frames...');
        setMessage('Video is large, performing partial analysis...');
      }

      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('scan-video-safety', {
        body: {
          videoBase64: base64,
          mimeType: file.type,
        },
      });

      if (error) throw error;

      const safetyResult: SafetyCheckResult = {
        result: data.result || 'allowed',
        message: data.message,
        categories: data.categories,
        score: data.score,
        audioTranscript: data.audioTranscript,
        visualAnalysis: data.visualAnalysis,
        audioAnalysis: data.audioAnalysis,
      };

      setResult(safetyResult.result);
      setMessage(safetyResult.message || '');
      setScanDetails({
        audioTranscript: safetyResult.audioTranscript,
        visualAnalysis: safetyResult.visualAnalysis,
        audioAnalysis: safetyResult.audioAnalysis,
      });

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
     // Check owner bypass
     const isOwner = await isCurrentUserOwner();
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
      const { data, error } = await supabase.functions.invoke('scan-content-safety', {
        body: {
          type: 'text',
          content: text,
        },
      });

      if (error) throw error;

      const safetyResult: SafetyCheckResult = {
        result: data.result || 'allowed',
        message: data.message,
        categories: data.categories,
        score: data.score,
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

// Helper to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
