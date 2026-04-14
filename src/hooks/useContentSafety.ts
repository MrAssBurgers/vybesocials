/**
 * Content Safety Hook
 * 
 * Hybrid moderation pipeline:
 * 1. NSFWJS (client-side) - instant sexual content detection
 * 2. Lovable AI (Gemini) - violence, gore, weapons, audio hate speech
 * 3. Keyword scanner - text-based hate speech / threats
 * 
 * The AI second-pass only runs if NSFWJS passes (to save API calls).
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { shouldBypassSafety } from '@/lib/ownerBypass';
import { scanImage as nsfwScanImage, scanVideo as nsfwScanVideo, scanText as nsfwScanText, type ScanResult } from '@/lib/nsfwScanner';
import { aiScanImage, aiScanVideoFrame, extractVideoFrame, transcribeVideoAudio, aiScanAudioTranscript, type AISafetyResult } from '@/lib/aiSafetyClient';

export type SafetyResult = 'scanning' | 'allowed' | 'warned' | 'blocked' | 'error';

interface SafetyCheckResult {
  result: SafetyResult;
  message?: string;
  categories?: string[];
  score?: number;
  audioTranscript?: string;
  visualAnalysis?: string;
  audioAnalysis?: string;
  suggestedAgeRating?: 'safe' | '13+' | '18+';
  ageRatingReasons?: string[];
}

/**
 * Merge NSFWJS result with AI second-pass result (worst wins)
 */
function mergeResults(nsfwResult: ScanResult, aiResult: AISafetyResult): SafetyCheckResult {
  const allCategories = [...(nsfwResult.categories || []), ...(aiResult.categories || [])];
  const worstScore = Math.max(nsfwResult.score, aiResult.score);

  let result: SafetyResult = 'allowed';
  let message = '';

  if (nsfwResult.result === 'blocked' || aiResult.result === 'blocked') {
    result = 'blocked';
    message = aiResult.result === 'blocked'
      ? aiResult.message
      : nsfwResult.message;
  } else if (nsfwResult.result === 'warned' || aiResult.result === 'warned') {
    result = 'warned';
    message = aiResult.result === 'warned'
      ? aiResult.message
      : nsfwResult.message;
  }

  return {
    result,
    message,
    categories: allCategories,
    score: worstScore,
    visualAnalysis: aiResult.visual_analysis,
    audioAnalysis: aiResult.audio_analysis,
    suggestedAgeRating: aiResult.suggested_age_rating,
    ageRatingReasons: aiResult.age_rating_reasons,
  };
}

export type ScanPhase = 'init' | 'nsfwjs' | 'ai-visual' | 'ai-audio' | 'done';

export function useContentSafety() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<SafetyResult>('scanning');
  const [message, setMessage] = useState<string>('');
  const [scanPhase, setScanPhase] = useState<ScanPhase>('init');
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
    setScanPhase('nsfwjs');
    setScanDetails({});

    try {
      // Pass 1: Client-side NSFWJS (instant)
      const nsfwResult: ScanResult = await nsfwScanImage(file);

      // If NSFWJS blocks it, no need for AI scan
      if (nsfwResult.result === 'blocked') {
        const safetyResult: SafetyCheckResult = {
          result: nsfwResult.result,
          message: nsfwResult.message,
          categories: nsfwResult.categories,
          score: nsfwResult.score,
        };
        setResult(safetyResult.result);
        setMessage(safetyResult.message || '');
        return safetyResult;
      }

      // Pass 2: AI scan for violence/gore/weapons
      setScanPhase('ai-visual');
      setMessage('Deep scanning for harmful content...');
      let aiResult: AISafetyResult;
      try {
        aiResult = await aiScanImage(file);
      } catch (err) {
        console.warn('AI safety scan unavailable, using NSFWJS result only:', err);
        aiResult = { allowed: true, result: 'allowed', categories: [], score: 0, message: '' };
      }

      setScanPhase('done');
      const merged = mergeResults(nsfwResult, aiResult);
      setResult(merged.result);
      setMessage(merged.message || '');
      setScanDetails({
        visualAnalysis: merged.visualAnalysis,
        audioAnalysis: merged.audioAnalysis,
      });
      return merged;
    } catch (err: any) {
      console.error('Safety scan error:', err);
      setScanPhase('done');
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
    setScanPhase('nsfwjs');
    setScanDetails({});

    try {
      // Pass 1: Client-side NSFWJS frame sampling
      const nsfwResult: ScanResult = await nsfwScanVideo(file);

      if (nsfwResult.result === 'blocked') {
        const safetyResult: SafetyCheckResult = {
          result: nsfwResult.result,
          message: 'This video contains content that violates community guidelines.',
          categories: nsfwResult.categories,
          score: nsfwResult.score,
        };
        setResult(safetyResult.result);
        setMessage(safetyResult.message || '');
        return safetyResult;
      }

      // Pass 2: AI scan - extract a key frame + attempt audio transcription
      setScanPhase('ai-visual');
      setMessage('Deep scanning video content...');
      
      let aiResult: AISafetyResult = { allowed: true, result: 'allowed', categories: [], score: 0, message: '' };
      let audioTranscript = '';

      try {
        // Extract a frame for visual AI analysis
        const frameBlob = await extractVideoFrame(file);

        // Attempt audio transcription
        setScanPhase('ai-audio');
        try {
          audioTranscript = await transcribeVideoAudio(file);
        } catch {
          console.warn('Audio transcription unavailable');
        }

        // Send frame + transcript to AI
        aiResult = await aiScanVideoFrame(frameBlob, audioTranscript || undefined);
      } catch (err) {
        console.warn('AI video scan unavailable, using NSFWJS result only:', err);
      }

      // If we got a transcript but AI scan was unavailable, check transcript with text scanner
      if (audioTranscript && aiResult.score === 0) {
        try {
          const textAiResult = await aiScanAudioTranscript(audioTranscript);
          if (textAiResult.score > aiResult.score) {
            aiResult = textAiResult;
          }
        } catch {
          // Fall back to local text scan
          const localTextResult = nsfwScanText(audioTranscript);
          if (localTextResult.score > aiResult.score) {
            aiResult = {
              allowed: localTextResult.result === 'allowed',
              result: localTextResult.result,
              categories: localTextResult.categories,
              score: localTextResult.score,
              message: localTextResult.message,
            };
          }
        }
      }

      setScanPhase('done');
      const merged = mergeResults(nsfwResult, aiResult);
      
      // Adjust message for video context
      if (merged.result === 'blocked') {
        merged.message = 'This video contains content that violates community guidelines.';
      } else if (merged.result === 'warned') {
        merged.message = 'This video may contain sensitive content. Viewer discretion advised.';
      } else {
        merged.message = 'Video passed safety checks.';
      }

      setResult(merged.result);
      setMessage(merged.message || '');
      setScanDetails({
        audioTranscript: audioTranscript || undefined,
        visualAnalysis: merged.visualAnalysis,
        audioAnalysis: merged.audioAnalysis,
      });
      return merged;
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
    setScanPhase('init');
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
    scanPhase,
    scanDetails,
    bypassEnabled,
    scanImage,
    scanVideo,
    scanText,
    reset,
    submitAppeal,
  };
}
