/**
 * Content Safety Hook
 *
 * Vybe Check pipeline (Phase 1):
 * 1. NSFWJS (client) — instant pre-filter
 * 2. SafeSearch on frames + OpenAI moderation/STT + Gemini borderline (server)
 * 3. Keyword scanner — text
 */

import { useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { shouldBypassSafety } from '@/lib/ownerBypass';
import { scanImage as nsfwScanImage, scanVideo as nsfwScanVideo, scanText as nsfwScanText, type ScanResult } from '@/lib/nsfwScanner';
import { type AISafetyResult } from '@/lib/aiSafetyClient';
import { fileToVybeFrames, invokeVybeCheck, isVybeCheckBlocked, isVybeCheckReviewBlocked } from '@/lib/vybeCheck';

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

      // Pass 2: Server Vybe Check (SafeSearch + OpenAI + Gemini 2.5)
      setScanPhase('ai-visual');
      setMessage('Running Vybe Check…');
      const frames = await fileToVybeFrames(file);
      const { result: vybeResult, unavailable } = await invokeVybeCheck({
        content_type: 'post',
        frames,
      });

      let aiResult: AISafetyResult;
      if (unavailable || !vybeResult) {
        const errorMessage = 'Vybe Check is unavailable. This content cannot be shared right now.';
        setResult('error');
        setMessage(errorMessage);
        return { result: 'error', message: errorMessage };
      } else if (isVybeCheckBlocked(vybeResult) || isVybeCheckReviewBlocked(vybeResult)) {
        aiResult = {
          allowed: false,
          result: 'blocked',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
        };
      } else if (vybeResult.status === 'limited') {
        aiResult = {
          allowed: true,
          result: 'warned',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
          suggested_age_rating: '13+',
        };
      } else {
        aiResult = {
          allowed: true,
          result: 'allowed',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
        };
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

      // Pass 2: Phase 1 Vybe Check (SafeSearch frames + OpenAI + Gemini borderline)
      setScanPhase('ai-visual');
      setMessage('Running Vybe Check…');

      const frames = await fileToVybeFrames(file);
      const { result: vybeResult, unavailable } = await invokeVybeCheck({
        content_type: 'video',
        frames,
      });

      let aiResult: AISafetyResult;
      if (unavailable || !vybeResult) {
        const errorMessage = 'Vybe Check is unavailable. This video cannot be shared right now.';
        setResult('error');
        setMessage(errorMessage);
        return { result: 'error', message: errorMessage };
      } else if (isVybeCheckBlocked(vybeResult) || isVybeCheckReviewBlocked(vybeResult)) {
        aiResult = {
          allowed: false,
          result: 'blocked',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
        };
      } else if (vybeResult.status === 'limited') {
        aiResult = {
          allowed: true,
          result: 'warned',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
          suggested_age_rating: vybeResult.status === 'limited' ? '13+' : '18+',
        };
      } else {
        aiResult = {
          allowed: true,
          result: 'allowed',
          categories: vybeResult.categories,
          score: vybeResult.score,
          message: vybeResult.message,
        };
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
        audioTranscript: vybeResult?.transcript,
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
      const { data: { user } } = await db.auth.getUser();
      if (!user) {
        toast.error('Please log in to submit an appeal');
        return false;
      }
      
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
        
      if (!profile) {
        toast.error('Profile not found');
        return false;
      }

      const { error } = await db.from('content_appeals').insert({
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
