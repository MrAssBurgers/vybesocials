import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { recordEmoji } from '@/lib/frequentEmojis';
import { recordShareTo } from '@/lib/shareRecency';

/**
 * User Adaptation Profile - Learns and stores user preferences
 */
export interface UserAdaptationProfile {
  // Communication style
  communicationStyle: 'casual' | 'formal' | 'mixed';
  messageLength: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'low' | 'medium' | 'high';
  
  // Interests & topics
  interests: string[];
  frequentTopics: string[];
  
  // Behavioral patterns
  activeHours: number[]; // 0-23
  responseSpeed: 'instant' | 'quick' | 'relaxed';
  
  // Tone preferences
  humorLevel: 'none' | 'light' | 'moderate' | 'heavy';
  formalityLevel: number; // 0-100
  
  // Vocabulary
  commonPhrases: string[];
  slangUsage: boolean;
  
  // Interaction history
  totalMessages: number;
  averageMessageLength: number;
  lastUpdated: string;
}

const DEFAULT_PROFILE: UserAdaptationProfile = {
  communicationStyle: 'mixed',
  messageLength: 'medium',
  emojiUsage: 'medium',
  interests: [],
  frequentTopics: [],
  activeHours: [],
  responseSpeed: 'quick',
  humorLevel: 'light',
  formalityLevel: 50,
  commonPhrases: [],
  slangUsage: false,
  totalMessages: 0,
  averageMessageLength: 0,
  lastUpdated: new Date().toISOString(),
};

const STORAGE_KEY = 'vybe_user_adaptation';

function loadLocalProfile(): UserAdaptationProfile {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PROFILE, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_PROFILE;
}

function saveLocalProfile(profile: UserAdaptationProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

// Analyze message to extract style patterns
function analyzeMessage(text: string): Partial<UserAdaptationProfile> {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = text.match(emojiRegex) || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Emoji usage analysis
  const emojiRatio = emojis.length / Math.max(words.length, 1);
  let emojiUsage: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (emojiRatio > 0.2) emojiUsage = 'high';
  else if (emojiRatio > 0.1) emojiUsage = 'medium';
  else if (emojiRatio > 0) emojiUsage = 'low';
  
  // Message length analysis
  let messageLength: 'short' | 'medium' | 'long' = 'medium';
  if (words.length < 10) messageLength = 'short';
  else if (words.length > 50) messageLength = 'long';
  
  // Formality analysis
  const informalMarkers = /\b(lol|lmao|omg|bruh|nah|yeah|gonna|wanna|gotta|kinda|sorta|u|ur|r|y|k|thx|pls|rn|tbh|imo|idk|ngl|fr|lowkey|highkey|vibes|lit|fire|goat|cap|bet|slay|sus)\b/gi;
  const formalMarkers = /\b(therefore|however|furthermore|consequently|nevertheless|regarding|concerning|additionally|moreover|subsequently)\b/gi;
  
  const informalCount = (text.match(informalMarkers) || []).length;
  const formalCount = (text.match(formalMarkers) || []).length;
  const slangUsage = informalCount > 0;
  
  let formalityLevel = 50;
  if (informalCount > formalCount) {
    formalityLevel = Math.max(0, 50 - (informalCount * 10));
  } else if (formalCount > informalCount) {
    formalityLevel = Math.min(100, 50 + (formalCount * 10));
  }
  
  // Communication style
  let communicationStyle: 'casual' | 'formal' | 'mixed' = 'mixed';
  if (formalityLevel < 30) communicationStyle = 'casual';
  else if (formalityLevel > 70) communicationStyle = 'formal';
  
  // Extract potential topics/interests (simple keyword extraction)
  const topicKeywords = words
    .filter(w => w.length > 4 && !w.match(/^(https?|www\.|@)/))
    .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter(w => w.length > 4);
  
  return {
    emojiUsage,
    messageLength,
    formalityLevel,
    communicationStyle,
    slangUsage,
    frequentTopics: topicKeywords.slice(0, 5),
    averageMessageLength: words.length,
  };
}

export function useUserAdaptation() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserAdaptationProfile>(loadLocalProfile);
  const [isLoading, setIsLoading] = useState(false);

  // Load from database if user is logged in
  useEffect(() => {
    if (!user?.id) return;
    
    const loadFromDB = async () => {
      try {
        const { data } = await db
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .single();
        
        if (data?.interests) {
          setProfile(prev => ({
            ...prev,
            interests: data.interests || [],
          }));
        }
      } catch {}
    };
    
    loadFromDB();
  }, [user?.id]);

  // Learn from a message the user sends
  const learnFromMessage = useCallback((message: string) => {
    if (!message || message.length < 5) return;
    
    const analysis = analyzeMessage(message);
    
    setProfile(prev => {
      // Weighted average for smooth learning
      const weight = Math.min(prev.totalMessages / 100, 0.9);
      const newWeight = 1 - weight;
      
      const updated: UserAdaptationProfile = {
        ...prev,
        communicationStyle: analysis.communicationStyle || prev.communicationStyle,
        messageLength: analysis.messageLength || prev.messageLength,
        emojiUsage: analysis.emojiUsage || prev.emojiUsage,
        formalityLevel: Math.round(prev.formalityLevel * weight + (analysis.formalityLevel || 50) * newWeight),
        slangUsage: analysis.slangUsage ?? prev.slangUsage,
        frequentTopics: [...new Set([...prev.frequentTopics, ...(analysis.frequentTopics || [])])].slice(0, 20),
        averageMessageLength: Math.round(prev.averageMessageLength * weight + (analysis.averageMessageLength || 20) * newWeight),
        totalMessages: prev.totalMessages + 1,
        activeHours: [...new Set([...prev.activeHours, new Date().getHours()])].slice(-10),
        lastUpdated: new Date().toISOString(),
      };
      
      saveLocalProfile(updated);
      return updated;
    });
  }, []);

  // Update specific interests
  const updateInterests = useCallback((interests: string[]) => {
    setProfile(prev => {
      const updated = {
        ...prev,
        interests: [...new Set([...prev.interests, ...interests])].slice(0, 30),
        lastUpdated: new Date().toISOString(),
      };
      saveLocalProfile(updated);
      return updated;
    });
  }, []);

  // Generate AI system prompt based on user's style
  const getAdaptedSystemPrompt = useCallback((basePrompt: string = ''): string => {
    const styleGuides: string[] = [];
    
    // Communication style
    if (profile.communicationStyle === 'casual') {
      styleGuides.push('Use casual, friendly language');
    } else if (profile.communicationStyle === 'formal') {
      styleGuides.push('Use professional, polished language');
    }
    
    // Message length
    if (profile.messageLength === 'short') {
      styleGuides.push('Keep responses brief and to the point');
    } else if (profile.messageLength === 'long') {
      styleGuides.push('Provide detailed, comprehensive responses');
    }
    
    // Emoji usage
    if (profile.emojiUsage === 'high') {
      styleGuides.push('Feel free to use emojis to add personality');
    } else if (profile.emojiUsage === 'none') {
      styleGuides.push('Avoid using emojis');
    }
    
    // Humor level
    if (profile.humorLevel === 'heavy') {
      styleGuides.push('Be witty and humorous');
    } else if (profile.humorLevel === 'none') {
      styleGuides.push('Keep a straightforward, serious tone');
    }
    
    // Slang usage
    if (profile.slangUsage) {
      styleGuides.push('You can use common slang and casual expressions');
    }
    
    // Interests context
    if (profile.interests.length > 0) {
      styleGuides.push(`The user is interested in: ${profile.interests.slice(0, 5).join(', ')}`);
    }
    
    const adaptationSection = styleGuides.length > 0
      ? `\n\nUser preferences (adapt your style):\n${styleGuides.map(s => `- ${s}`).join('\n')}`
      : '';
    
    return `${basePrompt}${adaptationSection}`;
  }, [profile]);

  // Get adapted smart reply suggestions
  const getAdaptedReplySuggestions = useCallback((context: string): string[] => {
    const suggestions: string[] = [];
    
    // Base suggestions on user's style
    if (profile.communicationStyle === 'casual') {
      if (profile.emojiUsage === 'high') {
        suggestions.push('sounds good! 😊', 'for sure!', 'bet! 🔥');
      } else {
        suggestions.push('sounds good!', 'for sure!', 'bet!');
      }
    } else {
      suggestions.push('That sounds great', 'I agree', 'Understood');
    }
    
    return suggestions;
  }, [profile]);

  const recordEmojiPreference = useCallback((emoji: string) => {
    recordEmoji(emoji);
  }, []);

  const recordShareTarget = useCallback((userId: string) => {
    recordShareTo(userId);
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    saveLocalProfile(DEFAULT_PROFILE);
  }, []);

  return {
    profile,
    isLoading,
    learnFromMessage,
    updateInterests,
    getAdaptedSystemPrompt,
    getAdaptedReplySuggestions,
    recordEmojiPreference,
    recordShareTarget,
    resetProfile,
  };
}
