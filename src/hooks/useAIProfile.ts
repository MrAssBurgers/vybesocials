import { useState, useEffect, useCallback } from 'react';

export type AIModel = 'gemini-flash' | 'gemini-pro' | 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano';

export interface AIModelInfo {
  id: AIModel;
  name: string;
  description: string;
  icon: string;
  speed: 'fast' | 'balanced' | 'powerful';
}

export const AI_MODELS: AIModelInfo[] = [
  { id: 'gemini-flash', name: 'Gemini Flash', description: 'Fast & versatile', icon: '⚡', speed: 'fast' },
  { id: 'gemini-pro', name: 'Gemini Pro', description: 'Most capable reasoning', icon: '🧠', speed: 'powerful' },
  { id: 'gpt-5', name: 'GPT-5', description: 'Powerful all-rounder', icon: '🌟', speed: 'powerful' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Great balance', icon: '✨', speed: 'balanced' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: 'Ultra fast', icon: '💨', speed: 'fast' },
];

interface AIProfile {
  name: string;
  personality: string;
  model: AIModel;
  feedDNA: boolean;
}

const AI_PROFILE_STORAGE_KEY = 'vybe_ai_profile_v2';

const DEFAULT_AI_PROFILE: AIProfile = {
  name: 'VYBE-AI',
  personality: 'A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping users succeed.',
  model: 'gemini-flash',
  feedDNA: true,
};

function loadAIProfile(): AIProfile {
  try {
    const stored = localStorage.getItem(AI_PROFILE_STORAGE_KEY);
    if (stored) return { ...DEFAULT_AI_PROFILE, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_AI_PROFILE;
}

function saveAIProfile(profile: AIProfile) {
  try { localStorage.setItem(AI_PROFILE_STORAGE_KEY, JSON.stringify(profile)); } catch {}
}

export function useAIProfile() {
  const [profile, setProfile] = useState<AIProfile>(loadAIProfile);

  const updateName = useCallback((name: string) => {
    setProfile(prev => {
      const updated = { ...prev, name: name.trim() || DEFAULT_AI_PROFILE.name };
      saveAIProfile(updated);
      return updated;
    });
  }, []);

  const updatePersonality = useCallback((personality: string) => {
    setProfile(prev => {
      const updated = { ...prev, personality: personality.trim() || DEFAULT_AI_PROFILE.personality };
      saveAIProfile(updated);
      return updated;
    });
  }, []);

  const updateModel = useCallback((model: AIModel) => {
    setProfile(prev => {
      const updated = { ...prev, model };
      saveAIProfile(updated);
      return updated;
    });
  }, []);

  const updateFeedDNA = useCallback((feedDNA: boolean) => {
    setProfile(prev => {
      const updated = { ...prev, feedDNA };
      saveAIProfile(updated);
      return updated;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setProfile(DEFAULT_AI_PROFILE);
    saveAIProfile(DEFAULT_AI_PROFILE);
  }, []);

  return {
    name: profile.name,
    personality: profile.personality,
    model: profile.model,
    feedDNA: profile.feedDNA,
    updateName,
    updatePersonality,
    updateModel,
    updateFeedDNA,
    resetToDefault,
  };
}
