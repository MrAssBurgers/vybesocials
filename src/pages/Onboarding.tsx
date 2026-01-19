import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InterestPicker } from '@/components/onboarding/InterestPicker';
import { CreatorSuggestions } from '@/components/onboarding/CreatorSuggestions';
import { ProfileSetup } from '@/components/onboarding/ProfileSetup';
import { SensitivitySettings } from '@/components/onboarding/SensitivitySettings';
import { EmailVerification } from '@/components/onboarding/EmailVerification';
import { ContactDiscovery } from '@/components/onboarding/ContactDiscovery';
import { PrivacySettings } from '@/components/onboarding/PrivacySettings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
// Invite mode stage type - must match InviteRedeem state machine
type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

const TOTAL_STEPS = 7;

type SensitivityLevel = 'standard' | 'restricted' | 'open';

interface OnboardingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function Onboarding({ onInviteNavigate, isInviteMode = false }: OnboardingProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // State for each step
  const [interests, setInterests] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    displayName: profile?.username || '',
    bio: '',
    linkUrl: '',
    avatarPreview: null as string | null,
    avatarFile: null as File | null,
  });
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('standard');
  const [isPrivate, setIsPrivate] = useState(false);

  const canProceed = () => {
    switch (step) {
      case 1: return interests.length >= 3;
      case 2: return true; // Can skip following
      case 3: return profileData.firstName.length > 0 && profileData.lastName.length > 0;
      case 4: return true;
      case 5: return true;
      case 6: return true; // Email verification is optional
      case 7: return true; // Contact discovery is optional
      default: return true;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinish = async () => {
    if (!profile) return;
    
    setLoading(true);
    try {
      // Upload avatar if changed
      let avatarUrl = profile.avatar_url;
      if (profileData.avatarFile) {
        const fileExt = profileData.avatarFile.name.split('.').pop();
        const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(`avatars/${fileName}`, profileData.avatarFile);
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('media')
            .getPublicUrl(`avatars/${fileName}`);
          avatarUrl = urlData.publicUrl;
        }
      }

      // Update profile with all onboarding data
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          display_name: profileData.displayName || `${profileData.firstName} ${profileData.lastName}`.trim(),
          bio: profileData.bio,
          link_url: profileData.linkUrl,
          avatar_url: avatarUrl,
          interests: interests,
          sensitivity_preference: sensitivity,
          is_private: isPrivate,
          onboarding_completed: true,
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success('Welcome to XD! 🎉');
      // Navigate to home (in invite mode, use callback)
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate('/home');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate('home');
    } else {
      navigate('/home');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-20"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-3 sm:p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="gradient-animated rounded-xl p-1.5 sm:p-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <span className="text-lg sm:text-xl font-bold gradient-text">XD</span>
        </div>
        <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground text-sm sm:text-base">
          {t('onboarding.skip')}
        </Button>
      </header>

      {/* Progress bar */}
      <div className="relative z-10 px-3 sm:px-4 py-2">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            className="h-full gradient-animated"
          />
        </div>
        <p className="text-center text-xs sm:text-sm text-muted-foreground mt-2">
          Step {step} of {TOTAL_STEPS}
        </p>
      </div>

      {/* Content */}
      <main className="relative z-10 flex-1 p-3 sm:p-4 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {step === 1 && (
                <InterestPicker selected={interests} onChange={setInterests} />
              )}
              {step === 2 && (
                <CreatorSuggestions
                  interests={interests}
                  following={following}
                  onChange={setFollowing}
                />
              )}
              {step === 3 && (
                <ProfileSetup
                  data={profileData}
                  onChange={setProfileData}
                  username={profile?.username || ''}
                />
              )}
              {step === 4 && (
                <SensitivitySettings value={sensitivity} onChange={setSensitivity} />
              )}
              {step === 5 && (
                <PrivacySettings isPrivate={isPrivate} onChange={setIsPrivate} />
              )}
              {step === 6 && (
                <EmailVerification />
              )}
              {step === 7 && (
                <ContactDiscovery onComplete={handleFinish} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer navigation */}
      <footer className="relative z-10 p-3 sm:p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3 sm:gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden xs:inline">{t('onboarding.back')}</span>
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1 sm:gap-2 gradient-animated text-sm sm:text-base"
            >
              <span className="hidden xs:inline">{t('onboarding.next')}</span>
              <span className="xs:hidden">Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={loading}
              className="flex items-center gap-1 sm:gap-2 gradient-animated text-sm sm:text-base"
            >
              {loading ? 'Saving...' : t('onboarding.finish')}
              <Sparkles className="w-4 h-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
