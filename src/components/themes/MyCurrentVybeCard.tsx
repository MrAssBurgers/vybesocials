import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Bookmark, Sparkles, Pencil, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUserTheme, THEME_PRESETS, getEquippedThemeTokens, type ThemeTokens } from '@/hooks/useCustomTheme';
import { ThemePreviewCanvas } from './ThemePreviewCanvas';
import { ShareMyThemeSheet } from './ShareMyThemeSheet';
import { useShareTheme } from '@/hooks/useSharedThemes';
import { Input } from '@/components/ui/input';

/**
 * "My Current VYBE" — sits at the top of Settings → Themes → Customize.
 * Reads the currently equipped tokens from localStorage (live source of truth),
 * falling back to the DB row and finally the classic preset.
 */
export function MyCurrentVybeCard() {
  const { profile } = useAuth();
  const { data: userTheme } = useUserTheme();
  const [showShare, setShowShare] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [localTokens, setLocalTokens] = useState<ThemeTokens | null>(null);
  const snapshot = useShareTheme();

  // Read live equipped theme from localStorage + CSS vars (stays in sync after equip)
  useEffect(() => {
    const read = () => {
      try {
        const equipped = getEquippedThemeTokens(profile?.id);
        const root = document.documentElement;
        const cs = getComputedStyle(root);
        const get = (name: string, fallback = '') =>
          (cs.getPropertyValue(name).trim() || fallback);
        const isDark = root.classList.contains('dark') || !root.classList.contains('light');

        if (equipped?.colorPrimary) {
          setLocalTokens({
            ...equipped,
            colorPrimary: get('--primary', equipped.colorPrimary),
            colorAccent: get('--accent', equipped.colorAccent),
            colorSecondary: get('--secondary', equipped.colorSecondary),
            bgMain: get('--background', equipped.bgMain),
            bgCard: get('--card', equipped.bgCard),
            textPrimary: get('--foreground', equipped.textPrimary),
            textSecondary: get('--muted-foreground', equipped.textSecondary),
            mode: isDark ? 'dark' : 'light',
          });
          return;
        }

        // Build entirely from CSS vars
        setLocalTokens({
          colorPrimary: get('--primary', '330 100% 60%'),
          colorAccent: get('--accent', '185 100% 50%'),
          colorSecondary: get('--secondary', '240 10% 12%'),
          bgMain: get('--background', '240 10% 4%'),
          bgCard: get('--card', '240 10% 6%'),
          textPrimary: get('--foreground', '0 0% 98%'),
          textSecondary: get('--muted-foreground', '240 5% 55%'),
          borderRadius: 'medium',
          mode: isDark ? 'dark' : 'light',
        } as ThemeTokens);
      } catch {}
    };
    read();
    const onEquipped = () => read();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'vybe-equipped-theme' ||
        e.key === 'vybe-custom-theme' ||
        (e.key?.startsWith('vybe-equipped-theme:') ?? false)
      ) {
        read();
      }
    };
    window.addEventListener('vybeThemeEquipped', onEquipped);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vybeThemeEquipped', onEquipped);
      window.removeEventListener('storage', onStorage);
    };
  }, [profile?.id]);

  const tokens: ThemeTokens = useMemo(() => {
    const fromDb = (userTheme?.theme_tokens as unknown as ThemeTokens) || null;
    return localTokens || fromDb || THEME_PRESETS.classic;
  }, [localTokens, userTheme]);

  const themeName =
    tokens.themeName || userTheme?.theme_name || 'My Current VYBE';



  const handleSnapshot = () => {
    snapshot.mutate({
      themeName,
      themeTokens: tokens,
      visibility: 'private',
    });
  };

  const handleSaveName = () => {
    // Local rename only — persists with next theme save
    tokens.themeName = nameDraft.trim() || themeName;
    setEditingName(false);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative liquid-glass-card overflow-hidden rounded-3xl p-4"
      >
        {/* Animated ambient gradient halo (matches Ambient Visual standard) */}
        <div
          className="absolute -inset-px rounded-3xl opacity-60 pointer-events-none -z-0"
          style={{
            background:
              'linear-gradient(120deg, hsl(var(--primary)/0.15), transparent 40%, hsl(var(--accent)/0.15))',
            backgroundSize: '300% 300%',
            animation: 'gradient-pan 12s linear infinite',
          }}
        />

        <div className="relative z-10 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  My Current VYBE
                </p>
                <AnimatePresence mode="wait">
                  {editingName ? (
                    <motion.div
                      key="edit"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1 mt-0.5"
                    >
                      <Input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                        maxLength={30}
                        className="h-7 text-sm font-bold px-2 bg-muted/30 border-border/40"
                      />
                      <button
                        onClick={handleSaveName}
                        className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => { setNameDraft(themeName); setEditingName(true); }}
                      className="flex items-center gap-1.5 text-base font-bold truncate active:scale-95 transition-transform"
                    >
                      <span className="truncate">{themeName}</span>
                      <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <ThemePreviewCanvas tokens={tokens} themeName={themeName} size="md" />

          {/* CTAs */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => setShowShare(true)}
              className="h-11 rounded-2xl font-bold text-sm bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
            >
              <Share2 className="h-4 w-4" />
              Share VYBE
            </button>
            <button
              onClick={handleSnapshot}
              disabled={snapshot.isPending}
              aria-label="Save snapshot"
              className="h-11 w-11 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
            >
              <Bookmark className="h-4 w-4 text-foreground" />
            </button>
          </div>

          {!profile && (
            <p className="text-[11px] text-muted-foreground text-center">
              Sign in to share themes
            </p>
          )}
        </div>
      </motion.div>

      <ShareMyThemeSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        tokens={tokens}
        initialName={themeName}
      />

      <style>{`
        @keyframes gradient-pan {
          0% { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
      `}</style>
    </>
  );
}
