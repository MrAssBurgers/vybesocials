import { useState, useEffect, useCallback } from 'react';

interface AIProfile {
  name: string;
  personality: string;
}

const AI_PROFILE_STORAGE_KEY = 'vybe_ai_profile';

const DEFAULT_AI_PROFILE: AIProfile = {
  name: 'Morgan',
  personality: 'A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping users succeed.',
};

function loadAIProfile(): AIProfile {
  try {
    const stored = localStorage.getItem(AI_PROFILE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return DEFAULT_AI_PROFILE;
}

function saveAIProfile(profile: AIProfile) {
  try {
    localStorage.setItem(AI_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
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

  const resetToDefault = useCallback(() => {
    setProfile(DEFAULT_AI_PROFILE);
    saveAIProfile(DEFAULT_AI_PROFILE);
  }, []);

  return {
    name: profile.name,
    personality: profile.personality,
    updateName,
    updatePersonality,
    resetToDefault,
  };
}
