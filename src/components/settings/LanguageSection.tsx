import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        {t('settings.language')}
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95',
              i18n.language === lang.code
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            <span className="text-xl">{lang.flag}</span>
            <div className="text-left min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{lang.nativeName}</p>
              <p className="text-xs text-muted-foreground truncate">{lang.name}</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
