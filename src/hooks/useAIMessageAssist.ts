import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message } from './useMessages';

export type AIAssistAction = 'rewrite' | 'shorter' | 'friendlier' | 'fix_grammar' | 'suggest_reply';

interface AIAssistResult {
  text: string;
  action: AIAssistAction;
}

/**
 * VYBE v1.1 - AI Message Assist
 * 
 * Features:
 * - Rewrite message (shorter, clearer, friendlier)
 * - Fix grammar & tone
 * - Suggest replies (context-aware)
 * - Never auto-sends
 * - Always optional
 */
export function useAIMessageAssist() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<AIAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assist = useCallback(async (
    action: AIAssistAction,
    currentText: string,
    recentMessages?: Message[],
  ): Promise<string | null> => {
    if (!currentText.trim() && action !== 'suggest_reply') {
      setError('Please enter some text first');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-message-assist', {
        body: {
          action,
          text: currentText,
          context: recentMessages?.slice(-5).map(m => ({
            role: m.sender_id,
            content: m.content,
          })),
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
  }, []);

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
  };
}

/**
 * AI Smart Replies - Lightweight suggestions
 */
export function useAISmartReplies() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generateReplies = useCallback(async (lastMessage: Message | null) => {
    if (!lastMessage?.content) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-smart-replies', {
        body: { message: lastMessage.content },
      });

      if (error) throw error;

      setSuggestions(data?.replies || []);
    } catch (err) {
      console.error('Smart replies error:', err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
