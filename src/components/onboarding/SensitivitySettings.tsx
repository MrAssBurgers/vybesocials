import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Shield, Eye, EyeOff, AlertTriangle, Lock } from 'lucide-react';

export type SensitivityLevel = 'protected' | 'moderate' | 'unfiltered';

interface SensitivityOption {
  id: SensitivityLevel;
  icon: typeof Shield;
  title: string;
  description: string;
  details: string[];
  color: string;
  bgColor: string;
  requiresAge?: number;
}

const sensitivityOptions: SensitivityOption[] = [
  { 
    id: 'protected', 
    icon: Shield,
    title: 'Completely Protected',
    description: 'Maximum safety with full content filtering',
    details: [
      'AI scans all images before sending/receiving',
      'Profanity in videos is hidden',
      'Mature content is blocked',
      'Recommended for younger users'
    ],
    color: 'text-emerald-500',
    bgColor: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
  },
  { 
    id: 'moderate', 
    icon: Eye,
    title: 'Moderately Filtered',
    description: 'Balanced safety with warnings',
    details: [
      'AI warns about sensitive images',
      'Profanity shows a warning before playing',
      'Mature content requires confirmation',
      'Good for most users'
    ],
    color: 'text-amber-500',
    bgColor: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
    requiresAge: 16,
  },
  { 
    id: 'unfiltered', 
    icon: EyeOff,
    title: 'Unfiltered',
    description: 'No content restrictions',
    details: [
      'No AI scanning on DM images',
      'All content shown without warnings',
      'Full access to mature content',
      'Adults only (18+)'
    ],
    color: 'text-rose-500',
    bgColor: 'from-rose-500/20 to-rose-500/5 border-rose-500/30',
    requiresAge: 18,
  },
];

interface SensitivitySettingsProps {
  value: SensitivityLevel;
  onChange: (value: SensitivityLevel) => void;
  userAge?: number;
}

export function SensitivitySettings({ value, onChange, userAge }: SensitivitySettingsProps) {
  const { t } = useTranslation();

  const isOptionDisabled = (option: SensitivityOption) => {
    if (!option.requiresAge) return false;
    if (!userAge) return false; // If no age, allow selection
    return userAge < option.requiresAge;
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
        >
          <Shield className="w-10 h-10 text-primary" />
        </motion.div>
        <h2 className="text-2xl font-bold gradient-text">Content Preferences</h2>
        <p className="text-muted-foreground mt-2">
          Choose how you want to experience content on VYBE
        </p>
      </div>

      <div className="space-y-3">
        {sensitivityOptions.map((option, index) => {
          const Icon = option.icon;
          const disabled = isOptionDisabled(option);
          const isSelected = value === option.id;
          
          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => !disabled && onChange(option.id)}
              disabled={disabled}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden',
                disabled 
                  ? 'opacity-50 cursor-not-allowed border-border bg-muted/30'
                  : isSelected
                    ? `border-current bg-gradient-to-br ${option.bgColor} ${option.color}`
                    : 'border-border bg-card hover:border-primary/50'
              )}
            >
              {/* Locked overlay for disabled options */}
              {disabled && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  <Lock className="w-3 h-3" />
                  <span>{option.requiresAge}+ only</span>
                </div>
              )}
              
              <div className="flex items-start gap-4">
                <div className={cn(
                  'p-2.5 rounded-xl transition-colors',
                  isSelected ? `${option.color} bg-current/10` : 'bg-muted'
                )}>
                  <Icon className={cn('w-5 h-5', isSelected ? option.color : 'text-muted-foreground')} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'font-semibold',
                    isSelected ? option.color : 'text-foreground'
                  )}>
                    {option.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                  
                  {/* Details list - show when selected */}
                  {isSelected && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 space-y-1.5"
                    >
                      {option.details.map((detail, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn('w-1 h-1 rounded-full', option.color.replace('text-', 'bg-'))} />
                          {detail}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </div>
                
                {/* Selection indicator */}
                {isSelected && !disabled && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn('w-6 h-6 rounded-full flex items-center justify-center', option.color.replace('text-', 'bg-'))}
                  >
                    <span className="text-xs text-white font-bold">✓</span>
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Cross-user safety note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="p-3 rounded-xl bg-muted/50 border border-border"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Safety Note:</span> In DMs, the stricter setting between you and the other person applies. 
            This ensures everyone feels safe regardless of individual preferences.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
