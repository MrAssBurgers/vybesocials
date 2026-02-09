import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Style element ID for custom animations
const CUSTOM_ANIM_STYLE_ID = 'vybe-custom-animations';

export interface CustomAnimations {
  keyframes: { name: string; frames: string }[];
  variables: { name: string; value: string }[];
  classes: { selector: string; animation: string }[];
  description: string;
}

/**
 * Apply custom animations to the document
 */
export function applyCustomAnimations(css: string): void {
  // Remove existing custom animations
  const existingStyle = document.getElementById(CUSTOM_ANIM_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Create and inject new style element
  const styleEl = document.createElement('style');
  styleEl.id = CUSTOM_ANIM_STYLE_ID;
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
  
  // Store in localStorage for persistence
  try {
    localStorage.setItem('vybe-custom-animations-css', css);
  } catch (e) {
    console.warn('Could not persist custom animations:', e);
  }
}

/**
 * Load custom animations from localStorage on app init
 */
export function initializeCustomAnimations(): void {
  try {
    const storedCss = localStorage.getItem('vybe-custom-animations-css');
    if (storedCss) {
      applyCustomAnimations(storedCss);
    }
  } catch (e) {
    console.warn('Could not load custom animations:', e);
  }
}

/**
 * Clear custom animations
 */
export function clearCustomAnimations(): void {
  const existingStyle = document.getElementById(CUSTOM_ANIM_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }
  try {
    localStorage.removeItem('vybe-custom-animations-css');
  } catch (e) {
    // Ignore
  }
}

/**
 * Hook for generating and applying custom animations
 */
export function useCustomAnimations() {
  const generateAnimations = useCallback(async (
    prompt: string, 
    mood: string = 'balanced'
  ): Promise<{ css: string; animations: CustomAnimations } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-custom-animations', {
        body: { prompt, mood },
      });
      
      if (error) {
        console.error('Animation generation error:', error);
        return null;
      }
      
      if (data.error) {
        console.error('Animation generation failed:', data.error);
        return null;
      }
      
      // Apply the generated CSS
      if (data.css) {
        applyCustomAnimations(data.css);
      }
      
      return {
        css: data.css,
        animations: data.animations,
      };
    } catch (error) {
      console.error('Failed to generate animations:', error);
      return null;
    }
  }, []);
  
  return {
    generateAnimations,
    applyCustomAnimations,
    clearCustomAnimations,
  };
}

export default useCustomAnimations;
