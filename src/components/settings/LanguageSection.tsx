import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe, Check, Search, X } from 'lucide-react';
import { languages } from '@/lib/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { Input } from '@/components/ui/input';

export function LanguageSection() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');

  const filteredLanguages = useMemo(() => {
    if (!search.trim()) return [...languages];
    const q = search.toLowerCase();
    return [...languages].filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [search]);

  const changeLanguage = (code: string) => {
    haptics.tap();
    i18n.changeLanguage(code);
    toast.success(t('settings.languageChanged'));
  };

  const currentLang = languages.find(l => l.code === i18n.language);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base mb-0.5 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {t('settings.language')}
            </h3>
            <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {t('settings.chooseLanguage')}
            </p>
          </div>
          {currentLang && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 flex-shrink-0">
              <span className="text-lg">{currentLang.flag}</span>
              <span className="text-xs font-medium text-primary">{currentLang.nativeName}</span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settings.languageSearch')}
            className="pl-9 pr-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Language grid */}
        <div className="max-h-[420px] overflow-y-auto pr-1 -mr-1 space-y-1.5 scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredLanguages.map((lang) => (
              <motion.button
                key={lang.code}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onClick={() => changeLanguage(lang.code)}
                className={cn(
                  'flex items-center gap-3 w-full p-3 rounded-xl border transition-all duration-200 active:scale-[0.98]',
                  i18n.language === lang.code
                    ? 'border-primary bg-primary/10 shadow-md shadow-primary/10'
                    : 'border-transparent hover:bg-muted/40'
                )}
              >
                <span className="text-2xl flex-shrink-0">{lang.flag}</span>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-foreground">{lang.nativeName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lang.name}</p>
                </div>
                {i18n.language === lang.code && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
                  >
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </AnimatePresence>

          {filteredLanguages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No languages found for "{search}"
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
