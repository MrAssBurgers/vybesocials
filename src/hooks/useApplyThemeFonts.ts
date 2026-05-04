/**
 * Hook to dynamically load and apply custom fonts from Google Fonts
 * Used by the VYBE Designer to apply user-selected font pairings
 */

// Available font pairings for the VYBE Designer
export const FONT_PAIRINGS = {
  modern: { 
    body: 'Inter', 
    display: 'Space Grotesk',
    description: 'Clean & Modern',
    category: 'sans-serif'
  },
  elegant: { 
    body: 'Crimson Pro', 
    display: 'Playfair Display',
    description: 'Elegant & Refined',
    category: 'serif'
  },
  playful: { 
    body: 'Nunito', 
    display: 'Fredoka',
    description: 'Fun & Friendly',
    category: 'rounded'
  },
  tech: { 
    body: 'JetBrains Mono', 
    display: 'Orbitron',
    description: 'Futuristic & Tech',
    category: 'mono'
  },
  minimal: { 
    body: 'IBM Plex Sans', 
    display: 'IBM Plex Sans',
    description: 'Minimal & Clean',
    category: 'sans-serif'
  },
  editorial: { 
    body: 'Merriweather', 
    display: 'Libre Baskerville',
    description: 'Editorial & Classic',
    category: 'serif'
  },
  bold: { 
    body: 'Montserrat', 
    display: 'Anton',
    description: 'Bold & Strong',
    category: 'display'
  },
  soft: { 
    body: 'Quicksand', 
    display: 'Comfortaa',
    description: 'Soft & Gentle',
    category: 'rounded'
  },
  artistic: {
    body: 'Poppins',
    display: 'Syne',
    description: 'Creative & Artistic',
    category: 'display'
  },
  luxury: {
    body: 'Cormorant Garamond',
    display: 'Cinzel',
    description: 'Luxury & Premium',
    category: 'serif'
  },
  gaming: {
    body: 'Exo 2',
    display: 'Audiowide',
    description: 'Gaming & Esports',
    category: 'display'
  },
  retro: {
    body: 'DM Sans',
    display: 'Righteous',
    description: 'Retro & Nostalgic',
    category: 'display'
  },
} as const;

export type FontPairingKey = keyof typeof FONT_PAIRINGS;

// Animation style presets that match fonts
export const ANIMATION_PRESETS = {
  smooth: {
    speed: 'normal',
    style: 'smooth',
    description: 'Elegant & Refined',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  bouncy: {
    speed: 'normal',
    style: 'bouncy',
    description: 'Fun & Playful',
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  snappy: {
    speed: 'fast',
    style: 'snappy',
    description: 'Quick & Modern',
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  zen: {
    speed: 'slow',
    style: 'smooth',
    description: 'Calm & Peaceful',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  instant: {
    speed: 'instant',
    style: 'snappy',
    description: 'Fast & Efficient',
    easing: 'linear',
  },
  none: {
    speed: 'instant',
    style: 'none',
    description: 'No Animations',
    easing: 'linear',
  },
} as const;

export type AnimationPresetKey = keyof typeof ANIMATION_PRESETS;

/**
 * Load Google Fonts dynamically
 */
export function loadGoogleFonts(fonts: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const uniqueFonts = [...new Set(fonts)];
    const fontFamilies = uniqueFonts.map(f => f.replace(/ /g, '+')).join('&family=');
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamilies}:wght@300;400;500;600;700;800;900&display=swap`;
    
    // Check if already loaded
    const existingLink = document.querySelector(`link[href*="${fontFamilies}"]`);
    if (existingLink) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('Failed to load fonts'));
    
    document.head.appendChild(link);
  });
}

/**
 * Apply font family to CSS variables and root element
 */
export function applyFontFamily(bodyFont: string, displayFont?: string) {
  const root = document.documentElement;
  const display = displayFont || bodyFont;

  // Mark loading so other code can avoid restyling mid-swap
  root.dataset.themeLoading = 'true';

  const apply = () => {
    // Batch all CSS variable writes synchronously to avoid mid-frame repaints
    root.style.setProperty('--font-body', `'${bodyFont}', system-ui, sans-serif`);
    root.style.setProperty('--font-display', `'${display}', system-ui, sans-serif`);
    root.style.fontFamily = `'${bodyFont}', system-ui, sans-serif`;
    delete root.dataset.themeLoading;
  };

  // Wait for fonts to actually be ready before swapping — prevents flicker/FOUT.
  if ('fonts' in document) {
    Promise.all([
      (document as any).fonts.load(`1em "${bodyFont}"`),
      (document as any).fonts.load(`1em "${display}"`),
    ]).then(apply).catch(apply);
  } else {
    apply();
  }

  // Persist
  localStorage.setItem('vybe-font-body', bodyFont);
  localStorage.setItem('vybe-font-display', display);
}

/**
 * Apply animation settings to CSS variables
 */
export function applyAnimationSettings(speed: string, style: string) {
  const root = document.documentElement;
  
  // Speed multiplier
  const speedMap: Record<string, string> = { 
    slow: '1.5', 
    normal: '1', 
    fast: '0.6', 
    instant: '0.1' 
  };
  
  // Easing functions
  const easingMap: Record<string, string> = {
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    snappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
    none: 'linear',
  };
  
  root.style.setProperty('--anim-speed', speedMap[speed] || '1');
  root.style.setProperty('--anim-easing', easingMap[style] || easingMap.smooth);
  root.dataset.animSpeed = speed;
  root.dataset.animStyle = style;
  
  // Store in localStorage
  localStorage.setItem('vybe-anim-speed', speed);
  localStorage.setItem('vybe-anim-style', style);
}

/**
 * Load and apply a complete font pairing with animations
 */
export async function applyFontPairing(pairingKey: FontPairingKey): Promise<void> {
  const pairing = FONT_PAIRINGS[pairingKey];
  if (!pairing) return;
  
  try {
    await loadGoogleFonts([pairing.body, pairing.display]);
    applyFontFamily(pairing.body, pairing.display);
  } catch (error) {
    console.error('Failed to load font pairing:', error);
  }
}

/**
 * Initialize fonts from localStorage on app load
 */
export function initializeStoredFonts(): void {
  const storedBody = localStorage.getItem('vybe-font-body');
  const storedDisplay = localStorage.getItem('vybe-font-display');
  const storedSpeed = localStorage.getItem('vybe-anim-speed');
  const storedStyle = localStorage.getItem('vybe-anim-style');
  
  if (storedBody) {
    loadGoogleFonts([storedBody, storedDisplay || storedBody])
      .then(() => applyFontFamily(storedBody, storedDisplay || storedBody))
      .catch(console.error);
  }
  
  if (storedSpeed && storedStyle) {
    applyAnimationSettings(storedSpeed, storedStyle);
  }
}
