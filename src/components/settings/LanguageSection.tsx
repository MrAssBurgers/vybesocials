import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { languages } from '@/lib/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export function LanguageSection() {
  const { t, i18n } = useTranslation();

  const changeLanguage = (code: string) => {
    haptics.tap();
    i18n.changeLanguage(code);
    toast.success('Language changed!');
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">{t('settings.language')}</h3>
            <p className="text-sm text-muted-foreground">
              Choose your preferred language for the app
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={cn(
                'flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.98]',
                i18n.language === lang.code
                  ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <span className="text-3xl">{lang.flag}</span>
              <div className="text-left flex-1 min-w-0">
                <p className="font-semibold truncate">{lang.nativeName}</p>
                <p className="text-sm text-muted-foreground truncate">{lang.name}</p>
              </div>
              {i18n.language === lang.code && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Current Selection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6 bg-muted/20"
      >
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Current language:</strong>{' '}
          {languages.find(l => l.code === i18n.language)?.nativeName || 'English'}
        </p>
      </motion.div>
    </div>
  );
}
