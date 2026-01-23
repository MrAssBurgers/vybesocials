import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message } from './useMessages';
import { useUserAdaptation } from './useUserAdaptation';

export type AIAssistAction = 'rewrite' | 'shorter' | 'friendlier' | 'fix_grammar' | 'suggest_reply';

interface AIAssistResult {
  text: string;
  action: AIAssistAction;
}

/**
 * VYBE v1.1 - AI Message Assist with User Adaptation
 * 
 * Features:
 * - Adapts to user's communication style
 * - Rewrite message (shorter, clearer, friendlier)
 * - Fix grammar & tone (while keeping user's voice)
 * - Suggest replies (context-aware + style-matched)
 * - Learns from user's messages over time
 */
export function useAIMessageAssist() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<AIAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { profile, learnFromMessage } = useUserAdaptation();

  const assist = useCallback(async (
    action: AIAssistAction,
    currentText: string,
    recentMessages?: Message[],
  ): Promise<string | null> => {
    if (!currentText.trim() && action !== 'suggest_reply') {
      setError('Please enter some text first');
      return null;
    }

    // Learn from the message being processed
    if (currentText.trim()) {
      learnFromMessage(currentText);
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Use adaptive AI endpoint with user profile
      const { data, error: fnError } = await supabase.functions.invoke('ai-adaptive-response', {
        body: {
          action,
          userProfile: profile,
          messages: [
            { role: 'user', content: currentText || 'Suggest a reply based on context' }
          ],
          context: recentMessages?.slice(-5).map(m => m.content).join('\n'),
        },
      });

      if (fnError) throw fnError;

      const result = data?.result || data?.text || '';
      setLastResult({ text: result, action });
      return result;
    } catch (err: any) {
      console.error('AI Assist error:', err);
      setError(err?.message || 'AI assist failed');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [profile, learnFromMessage]);

  const rewrite = useCallback((text: string) => assist('rewrite', text), [assist]);
  const makeShorter = useCallback((text: string) => assist('shorter', text), [assist]);
  const makeFriendlier = useCallback((text: string) => assist('friendlier', text), [assist]);
  const fixGrammar = useCallback((text: string) => assist('fix_grammar', text), [assist]);
  const suggestReply = useCallback((messages: Message[]) => 
    assist('suggest_reply', '', messages), [assist]);

  const clearResult = useCallback(() => setLastResult(null), []);

  return {
    isProcessing,
    lastResult,
    error,
    rewrite,
    makeShorter,
    makeFriendlier,
    fixGrammar,
    suggestReply,
    clearResult,
    userProfile: profile,
  };
}

/**
 * AI Smart Replies - Adaptive suggestions that match user's style
 */
export function useAISmartReplies() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { profile } = useUserAdaptation();

  const generateReplies = useCallback(async (lastMessage: Message | null) => {
    if (!lastMessage?.content) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      // Use adaptive endpoint with user profile for personalized suggestions
      const { data, error } = await supabase.functions.invoke('ai-adaptive-response', {
        body: { 
          action: 'smart_replies',
          context: lastMessage.content,
          userProfile: profile,
        },
      });

      if (error) throw error;

      setSuggestions(data?.replies || []);
    } catch (err) {
      console.error('Smart replies error:', err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  const clearSuggestions = useCallback(() => setSuggestions([]), []);

  return { suggestions, isLoading, generateReplies, clearSuggestions };
}

/**
 * AI Chat Summary
 */
export function useAIChatSummary() {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateSummary = useCallback(async (messages: Message[]) => {
    if (!messages?.length) {
      setSummary(null);
      return null;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat-summary', {
        body: {
          messages: messages.slice(-50).map(m => ({
            sender: m.sender?.username || 'Unknown',
            content: m.content || (m.media_type === 'image' ? '[Photo]' : '[Voice message]'),
            timestamp: m.created_at,
          })),
        },
      });

      if (error) throw error;

      const result = data?.summary || 'Unable to generate summary';
      setSummary(result);
      return result;
    } catch (err: any) {
      console.error('Chat summary error:', err);
      setSummary('Failed to generate summary');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSummary = useCallback(() => setSummary(null), []);

  return { summary, isLoading, generateSummary, clearSummary };
}
