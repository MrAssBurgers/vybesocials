import { useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { Message } from './useMessages';
import { useUserAdaptation } from './useUserAdaptation';

export type AIAssistAction = 'rewrite' | 'shorter' | 'friendlier' | 'fix_grammar' | 'suggest_reply';

interface AIAssistResult {
  text: string;
  action: AIAssistAction;
}

const ACTION_MODE: Record<Exclude<AIAssistAction, 'suggest_reply'>, string> = {
  rewrite: 'improve',
  shorter: 'shorten',
  friendlier: 'friendlier',
  fix_grammar: 'grammar',
};

/**
 * VYBE v1.1 - AI Message Assist with User Adaptation
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

    if (currentText.trim()) {
      learnFromMessage(currentText);
    }

    setIsProcessing(true);
    setError(null);

    try {
      if (action === 'suggest_reply') {
        const last = recentMessages?.[recentMessages.length - 1];
        const { data, error: fnError } = await db.functions.invoke('ai-smart-replies', {
          body: {
            lastMessage: last?.content || 'Say hi',
            context: recentMessages?.slice(-5).map((m) => m.content).join('\n'),
          },
        });
        if (fnError) throw fnError;
        const result = (data?.replies as string[] | undefined)?.[0] || '';
        setLastResult({ text: result, action });
        return result;
      }

      const { data, error: fnError } = await db.functions.invoke('ai-message-assist', {
        body: {
          text: currentText,
          mode: ACTION_MODE[action],
        },
      });

      if (fnError) throw fnError;

      const result = data?.result || '';
      setLastResult({ text: result, action });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI assist failed';
      console.error('AI Assist error:', err);
      setError(message);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [learnFromMessage]);

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

/** AI Smart Replies - three short suggestions for the last message. */
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
      const { data, error } = await db.functions.invoke('ai-smart-replies', {
        body: {
          lastMessage: lastMessage.content,
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
      const { data, error } = await db.functions.invoke('ai-chat-summary', {
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
    } catch (err: unknown) {
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
