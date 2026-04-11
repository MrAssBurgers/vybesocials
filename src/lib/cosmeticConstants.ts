// ── Shared cosmetic constants across Locker, Profile, VybePass ──

// Theme background images
import midnightImg from '@/assets/themes/midnight.jpg';
import sunsetVibesImg from '@/assets/themes/sunset-vibes.jpg';
import arcticImg from '@/assets/themes/arctic.jpg';
import neonCityImg from '@/assets/themes/neon-city.jpg';
import infernoImg from '@/assets/themes/inferno.jpg';
import galaxyImg from '@/assets/themes/galaxy.jpg';
import auroraBorealisImg from '@/assets/themes/aurora-borealis.jpg';
import voidImg from '@/assets/themes/void.jpg';

// ── Name Colors ─────────────────────────────────────────────────
export const NAME_COLOR_MAP: Record<string, string> = {
  'Crimson': '#DC2626',
  'Ocean Blue': '#2563EB',
  'Emerald': '#059669',
  'Sunset Orange': '#EA580C',
  'Neon Pink': '#EC4899',
  'Ice Blue': '#06B6D4',
  'Royal Purple': '#7C3AED',
  'Toxic Green': '#84CC16',
  // Owner exclusive
  'Gold': '#EAB308',
  'Diamond White': '#E2E8F0',
  'Holographic': 'linear-gradient(90deg, #EC4899 0%, #8B5CF6 10%, #06B6D4 20%, #10B981 30%, #EAB308 40%, #EC4899 50%, #8B5CF6 60%, #06B6D4 70%, #10B981 80%, #EAB308 90%, #EC4899 100%)',
  // Mod exclusive
  'Shield Silver': '#94A3B8',
  'Justice Blue': '#3B82F6',
  'Guardian Green': '#22C55E',
  // Premium exclusive
  'Premium Gold': 'linear-gradient(90deg, #92400E 0%, #D97706 8.333%, #FBBF24 16.666%, #FEF3C7 25%, #FBBF24 33.333%, #D97706 41.666%, #92400E 50%, #D97706 58.333%, #FBBF24 66.666%, #FEF3C7 75%, #FBBF24 83.333%, #D97706 91.666%, #92400E 100%)',
};

// Colors restricted to specific roles (owner/mod)
export const RESTRICTED_COLORS: Record<string, 'owner' | 'mod'> = {
  'Gold': 'owner',
  'Diamond White': 'owner',
  'Holographic': 'owner',
  'Shield Silver': 'mod',
  'Justice Blue': 'mod',
  'Guardian Green': 'mod',
};

// ── Theme Previews ──────────────────────────────────────────────
export const THEME_PREVIEW: Record<string, { from: string; to: string }> = {
  'Midnight': { from: '#1e1b4b', to: '#312e81' },
  'Sunset Vibes': { from: '#9a3412', to: '#dc2626' },
  'Arctic': { from: '#164e63', to: '#0e7490' },
  'Neon City': { from: '#701a75', to: '#be185d' },
  'Inferno': { from: '#7c2d12', to: '#dc2626' },
  'Galaxy': { from: '#1e1b4b', to: '#6d28d9' },
  'Aurora Borealis': { from: '#064e3b', to: '#6d28d9' },
  'Void': { from: '#0a0a0a', to: '#1c1917' },
  // Premium exclusive
  'Obsidian': { from: '#0c0c0c', to: '#1a1a2e' },
};

// ── Theme Images ────────────────────────────────────────────────
export const THEME_IMAGES: Record<string, string> = {
  'Midnight': midnightImg,
  'Sunset Vibes': sunsetVibesImg,
  'Arctic': arcticImg,
  'Neon City': neonCityImg,
  'Inferno': infernoImg,
  'Galaxy': galaxyImg,
  'Aurora Borealis': auroraBorealisImg,
  'Void': voidImg,
};

// ── Theme accent colors (for full profile transformation) ───────
export const THEME_ACCENTS: Record<string, { bg: string; text: string; card: string; accent: string }> = {
  'Midnight': { bg: '#0f0d2e', text: '#c4b5fd', card: 'rgba(49,46,129,0.4)', accent: '#818cf8' },
  'Sunset Vibes': { bg: '#451a03', text: '#fed7aa', card: 'rgba(154,52,18,0.4)', accent: '#fb923c' },
  'Arctic': { bg: '#083344', text: '#a5f3fc', card: 'rgba(14,116,144,0.4)', accent: '#22d3ee' },
  'Neon City': { bg: '#4a044e', text: '#f0abfc', card: 'rgba(190,24,93,0.4)', accent: '#e879f9' },
  'Inferno': { bg: '#431407', text: '#fed7aa', card: 'rgba(220,38,38,0.3)', accent: '#f97316' },
  'Galaxy': { bg: '#1e1b4b', text: '#c4b5fd', card: 'rgba(109,40,217,0.35)', accent: '#a78bfa' },
  'Aurora Borealis': { bg: '#022c22', text: '#a7f3d0', card: 'rgba(109,40,217,0.3)', accent: '#34d399' },
  'Void': { bg: '#0a0a0a', text: '#a8a29e', card: 'rgba(28,25,23,0.6)', accent: '#57534e' },
  // Premium exclusive
  'Obsidian': { bg: '#0c0c0c', text: '#d4d4d8', card: 'rgba(26,26,46,0.5)', accent: '#a78bfa' },
};

// ── Theme Gradients (for backward compat) ───────────────────────
export const THEME_GRADIENTS: Record<string, string> = {
  'Midnight': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
  'Sunset Vibes': 'linear-gradient(135deg, #9a3412 0%, #dc2626 50%, #f59e0b 100%)',
  'Arctic': 'linear-gradient(135deg, #164e63 0%, #0e7490 50%, #67e8f9 100%)',
  'Neon City': 'linear-gradient(135deg, #701a75 0%, #be185d 50%, #ec4899 100%)',
  'Inferno': 'linear-gradient(135deg, #7c2d12 0%, #dc2626 50%, #f97316 100%)',
  'Galaxy': 'linear-gradient(135deg, #1e1b4b 0%, #6d28d9 50%, #a78bfa 100%)',
  'Aurora Borealis': 'linear-gradient(135deg, #064e3b 0%, #6d28d9 40%, #06b6d4 70%, #10b981 100%)',
  'Void': 'linear-gradient(135deg, #0a0a0a 0%, #1c1917 50%, #292524 100%)',
  // Premium exclusive
  'Obsidian': 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16132e 100%)',
};

// ── Effect Class Map ────────────────────────────────────────────
export const EFFECT_CLASS_MAP: Record<string, string> = {
  'Sparkle': 'sparkle-name',
  'Rainbow Shift': 'rainbow-name',
  'Fire Trail': 'fire-glow',
  'Cosmic Glow': 'cosmic-name',
  'Glitch': 'glitch-name',
  'Neon Pulse': 'neon-pulse-name',
  'Shadow Flicker': 'shadow-flicker-name',
  'Aurora Wave': 'aurora-wave-name',
  'Electric Surge': 'electric-surge-name',
  'Plasma Storm': 'plasma-storm-name',
  // Premium exclusive
  'Crown Glow': 'crown-glow-name',
};

// Intense effect classes for profile view (amplified)
export const EFFECT_CLASS_MAP_INTENSE: Record<string, string> = {
  'Sparkle': 'animate-[sparkle-name-intense_1.5s_ease-in-out_infinite]',
  'Rainbow Shift': 'animate-[rainbow-shift_2s_linear_infinite]',
  'Fire Trail': 'animate-[fire-glow-intense_1s_ease-in-out_infinite]',
  'Cosmic Glow': 'animate-[cosmic-glow-intense_3s_ease-in-out_infinite]',
  'Glitch': 'animate-[glitch-text_0.3s_steps(2)_infinite]',
  'Neon Pulse': 'animate-[neon-pulse_1.5s_ease-in-out_infinite]',
  'Shadow Flicker': 'animate-[shadow-flicker_0.8s_ease-in-out_infinite]',
  'Aurora Wave': 'animate-[aurora-wave_3s_ease-in-out_infinite]',
  'Electric Surge': 'animate-[electric-surge_0.5s_ease-in-out_infinite]',
  'Plasma Storm': 'animate-[plasma-storm_2s_ease-in-out_infinite]',
  // Premium exclusive
  'Crown Glow': 'animate-[crown-glow_2s_ease-in-out_infinite]',
};

// ── Frame Class Map ─────────────────────────────────────────────
export const FRAME_CLASS_MAP: Record<string, string> = {
  'Silver Ring': 'ring-[3px] ring-gray-400/60 shadow-[0_0_12px_2px_rgba(156,163,175,0.3)]',
  'Blue Glow': 'ring-[3px] ring-blue-400/70 shadow-[0_0_20px_4px_rgba(96,165,250,0.35)]',
  'Purple Aura': 'ring-[3px] ring-purple-500/70 shadow-[0_0_20px_4px_rgba(168,85,247,0.35)]',
  'Gold Frame': 'ring-[3px] ring-yellow-400/80 shadow-[0_0_24px_6px_rgba(250,204,21,0.35)]',
  'Diamond Frame': 'ring-[3px] ring-cyan-300/80 shadow-[0_0_28px_8px_rgba(103,232,249,0.4)] animate-[diamond-pulse_2s_ease-in-out_infinite]',
  'Neon Ring': 'ring-[3px] ring-green-400/80 shadow-[0_0_24px_6px_rgba(74,222,128,0.4)] animate-[neon-ring-pulse_2s_ease-in-out_infinite]',
  'Emerald Ring': 'ring-[3px] ring-emerald-500/70 shadow-[0_0_20px_4px_rgba(16,185,129,0.35)]',
  'Sunset Halo': 'ring-[3px] ring-orange-400/80 shadow-[0_0_24px_6px_rgba(251,146,60,0.4)] animate-[sunset-halo_3s_ease-in-out_infinite]',
  'Lightning Frame': 'ring-[3px] ring-yellow-300/80 shadow-[0_0_28px_8px_rgba(253,224,71,0.4)] animate-[lightning-flash_2s_ease-in-out_infinite]',
  'Obsidian Frame': 'ring-[3px] ring-gray-800/90 shadow-[0_0_20px_4px_rgba(0,0,0,0.5),0_0_40px_8px_rgba(88,28,135,0.2)]',
  'Holographic Frame': 'ring-[3px] ring-pink-400/60 shadow-[0_0_24px_6px_rgba(236,72,153,0.3)] animate-[holographic-shift_3s_linear_infinite]',
};

// ── Frame colors for locker preview ─────────────────────────────
export const FRAME_COLORS: Record<string, string> = {
  'Silver Ring': '#9CA3AF',
  'Blue Glow': '#60A5FA',
  'Purple Aura': '#A855F7',
  'Gold Frame': '#FACC15',
  'Diamond Frame': '#67E8F9',
  'Neon Ring': '#4ADE80',
  'Emerald Ring': '#34D399',
  'Sunset Halo': '#FB923C',
  'Lightning Frame': '#FDE047',
  'Obsidian Frame': '#52525B',
  'Holographic Frame': '#A78BFA',
};

// ── Frame style map for locker cards ────────────────────────────
export const FRAME_STYLE_MAP: Record<string, { ring: string; shadow: string }> = {
  'Silver Ring': { ring: 'ring-2 ring-gray-400', shadow: 'shadow-[0_0_8px_rgba(156,163,175,0.5)]' },
  'Blue Glow': { ring: 'ring-2 ring-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.5)]' },
  'Purple Aura': { ring: 'ring-2 ring-purple-500', shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]' },
  'Gold Frame': { ring: 'ring-2 ring-yellow-400', shadow: 'shadow-[0_0_8px_rgba(250,204,21,0.5)]' },
  'Fire Ring': { ring: 'ring-2 ring-orange-500', shadow: 'shadow-[0_0_8px_rgba(249,115,22,0.5)]' },
  'Diamond Frame': { ring: 'ring-2 ring-cyan-300', shadow: 'shadow-[0_0_8px_rgba(103,232,249,0.5)]' },
  'Neon Ring': { ring: 'ring-2 ring-green-400', shadow: 'shadow-[0_0_8px_rgba(74,222,128,0.5)]' },
  'Emerald Ring': { ring: 'ring-2 ring-emerald-400', shadow: 'shadow-[0_0_8px_rgba(52,211,153,0.5)]' },
  'Sunset Halo': { ring: 'ring-2 ring-amber-400', shadow: 'shadow-[0_0_8px_rgba(251,191,36,0.5)]' },
  'Lightning Frame': { ring: 'ring-2 ring-yellow-300', shadow: 'shadow-[0_0_8px_rgba(253,224,71,0.5)]' },
  'Obsidian Frame': { ring: 'ring-2 ring-zinc-600', shadow: 'shadow-[0_0_8px_rgba(82,82,91,0.5)]' },
  'Holographic Frame': { ring: 'ring-2 ring-violet-400', shadow: 'shadow-[0_0_8px_rgba(167,139,250,0.5)]' },
};
