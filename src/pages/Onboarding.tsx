import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { UsernameSetup } from '@/components/onboarding/UsernameSetup';
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

type SensitivityLevel = 'standard' | 'restricted' | 'open';

interface OnboardingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function Onboarding({ onInviteNavigate, isInviteMode = false }: OnboardingProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  
  // Check if user needs to set username (Google OAuth users without profile)
  const needsUsername = !profile?.username;
  const TOTAL_STEPS = needsUsername ? 8 : 7;
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [usernameValid, setUsernameValid] = useState(false);

  // State for each step
  const [username, setUsername] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    bio: '',
    linkUrl: '',
    avatarPreview: null as string | null,
    avatarFile: null as File | null,
  });
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('standard');
  const [isPrivate, setIsPrivate] = useState(false);

  // Initialize displayName from username when available
  useEffect(() => {
    if (profile?.username && !profileData.displayName) {
      setProfileData(prev => ({ ...prev, displayName: profile.username }));
    }
  }, [profile?.username]);

  // Update displayName when username changes (for new users)
  useEffect(() => {
    if (needsUsername && username && !profileData.displayName) {
      setProfileData(prev => ({ ...prev, displayName: username }));
    }
  }, [username, needsUsername]);

  // Get the actual step content based on whether username is needed
  const getStepContent = () => {
    if (needsUsername) {
      // Username step is step 1
      return step;
    }
    // No username step, so actual steps are shifted
    return step;
  };

  const canProceed = () => {
    if (needsUsername && step === 1) {
      return usernameValid;
    }
    
    const actualStep = needsUsername ? step - 1 : step;
    switch (actualStep) {
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
    if (!user) return;
    
    setLoading(true);
    try {
      // Upload avatar if changed
      let avatarUrl = profile?.avatar_url || null;
      if (profileData.avatarFile) {
        const fileExt = profileData.avatarFile.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        
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

      // Determine the final username
      const finalUsername = needsUsername ? username : profile?.username;
      const finalDisplayName = profileData.displayName || finalUsername || `${profileData.firstName} ${profileData.lastName}`.trim();

      // Upsert profile with all onboarding data (handles both new and existing profiles)
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          username: finalUsername?.toLowerCase(),
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          display_name: finalDisplayName,
          bio: profileData.bio,
          link_url: profileData.linkUrl,
          avatar_url: avatarUrl,
          interests: interests,
          sensitivity_preference: sensitivity,
          is_private: isPrivate,
          onboarding_completed: true,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // CRITICAL: Emit event for TutorialProvider to trigger tutorial
      console.log('[Onboarding] Completed, dispatching event');
      window.dispatchEvent(new CustomEvent('onboarding-completed'));

      toast.success('Welcome to VYBE! 🎉');
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

  const handleSkip = async () => {
    if (!user) {
      // Guest user - just go home
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate('/home');
      }
      return;
    }

    setLoading(true);
    try {
      // Determine the username to use
      const finalUsername = needsUsername && username 
        ? username.toLowerCase() 
        : profile?.username || `user_${user.id.substring(0, 8)}`;

      // Save minimal profile with onboarding_completed so Home doesn't redirect back
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          username: finalUsername,
          onboarding_completed: true,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Skip save error:', error);
        toast.error('Could not save profile. Please try again.');
        return;
      }

      // Navigate to home
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate('/home');
      }
    } catch (err) {
      console.error('Skip error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
        <VYBELogo size="md" />
        <Button variant="ghost" onClick={handleSkip} disabled={loading} className="text-muted-foreground text-sm sm:text-base">
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
              {/* Username step for new users (Google OAuth) */}
              {needsUsername && step === 1 && (
                <UsernameSetup
                  username={username}
                  onChange={setUsername}
                  onValidChange={setUsernameValid}
                />
              )}
              {/* Regular steps - offset by 1 if username step exists */}
              {(needsUsername ? step === 2 : step === 1) && (
                <InterestPicker selected={interests} onChange={setInterests} />
              )}
              {(needsUsername ? step === 3 : step === 2) && (
                <CreatorSuggestions
                  interests={interests}
                  following={following}
                  onChange={setFollowing}
                />
              )}
              {(needsUsername ? step === 4 : step === 3) && (
                <ProfileSetup
                  data={profileData}
                  onChange={setProfileData}
                  username={needsUsername ? username : (profile?.username || '')}
                />
              )}
              {(needsUsername ? step === 5 : step === 4) && (
                <SensitivitySettings value={sensitivity} onChange={setSensitivity} />
              )}
              {(needsUsername ? step === 6 : step === 5) && (
                <PrivacySettings isPrivate={isPrivate} onChange={setIsPrivate} />
              )}
              {(needsUsername ? step === 7 : step === 6) && (
                <EmailVerification />
              )}
              {(needsUsername ? step === 8 : step === 7) && (
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
