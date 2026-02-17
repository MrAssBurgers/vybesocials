import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { UsernameSetup } from '@/components/onboarding/UsernameSetup';
import { InterestPicker } from '@/components/onboarding/InterestPicker';
import { CreatorSuggestions } from '@/components/onboarding/CreatorSuggestions';
import { ProfileSetup } from '@/components/onboarding/ProfileSetup';
import { SensitivitySettings, SensitivityLevel } from '@/components/onboarding/SensitivitySettings';
import { AgeSetup } from '@/components/onboarding/AgeSetup';
import { EmailVerification } from '@/components/onboarding/EmailVerification';
import { ContactDiscovery } from '@/components/onboarding/ContactDiscovery';
import { PrivacySettings } from '@/components/onboarding/PrivacySettings';
import { PermissionsSetup } from '@/components/onboarding/PermissionsSetup';
import { AIVybeDesigner } from '@/components/onboarding/AIVybeDesigner';
import { LegalAcceptance } from '@/components/onboarding/LegalAcceptance';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { toast } from 'sonner';

// Invite mode stage type - must match InviteRedeem state machine
type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

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
  // Total steps: username(optional) + age + interests + creators + profile + sensitivity + privacy + permissions + email + legal (then straight to VYBE designer)
  const TOTAL_STEPS = needsUsername ? 11 : 10;
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [usernameValid, setUsernameValid] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [showAIDesigner, setShowAIDesigner] = useState(false);

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
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('protected');
  const [isPrivate, setIsPrivate] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [legalAccepted, setLegalAccepted] = useState(false);

  // Username IS the display name by default
  useEffect(() => {
    const name = needsUsername ? username : profile?.username;
    if (name) {
      setProfileData(prev => ({ ...prev, displayName: name }));
    }
  }, [username, profile?.username, needsUsername]);

  // Get the actual step content based on whether username is needed
  const getStepContent = () => {
    if (needsUsername) {
      // Username step is step 1
      return step;
    }
    // No username step, so actual steps are shifted
    return step;
  };

  const canProceed = useCallback(() => {
    if (needsUsername && step === 1) {
      return usernameValid;
    }
    
    const actualStep = needsUsername ? step - 1 : step;
    switch (actualStep) {
      case 1: return dateOfBirth !== null && (userAge === undefined || userAge >= 13); // Age step
      case 2: return interests.length >= 3;
      case 3: return true; // Can skip following
      case 4: return profileData.firstName.length > 0 && profileData.lastName.length > 0;
      case 5: return true; // Sensitivity
      case 6: return true; // Privacy
      case 7: return true; // Permissions - always allow proceeding (optional)
      case 8: return true; // Email verification is optional
      case 9: return legalAccepted; // Must accept Terms & Privacy
      default: return true;
    }
  }, [needsUsername, step, usernameValid, dateOfBirth, userAge, interests.length, profileData.firstName.length, profileData.lastName.length]);

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
      // Username IS the display name - only override if user explicitly changed it
      const finalDisplayName = profileData.displayName && profileData.displayName !== '' 
        ? profileData.displayName 
        : finalUsername || '';

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
          date_of_birth: dateOfBirth?.toISOString().split('T')[0] || null,
          onboarding_completed: true,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Record legal acceptance
      if (legalAccepted) {
        await supabase.from('legal_acceptances').upsert([
          { user_id: user.id, document_type: 'tos', document_version: '2.0' },
          { user_id: user.id, document_type: 'privacy', document_version: '2.0' },
        ], { onConflict: 'user_id,document_type,document_version' });
      }

      // Show the AI VYBE Designer
      setLoading(false);
      setShowAIDesigner(true);
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // Called when AI designer completes
  const handleDesignerComplete = () => {
    console.log('[Onboarding] Completed, dispatching event');
    window.dispatchEvent(new CustomEvent('onboarding-completed'));
    toast.success('Welcome to VYBE! 🎉');
    
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate('home');
    } else {
      navigate('/home', { replace: true });
    }
  };

  const handleSkip = async () => {
    // Prevent double-clicks / spam
    if (loading) return;
    
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

      // Navigate to home (client-side to preserve auth state)
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      console.error('Skip error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show AI VYBE Designer as fullscreen overlay
  if (showAIDesigner) {
    return (
      <AIVybeDesigner
        interests={interests}
        onComplete={handleDesignerComplete}
        onSkip={handleDesignerComplete}
      />
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Animated background - CSS-only for better performance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Primary gradient orb */}
        <div 
          className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 rounded-full blur-3xl opacity-30"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, transparent 70%)',
            animation: 'onboarding-float 20s ease-in-out infinite',
          }}
        />
        {/* Secondary accent orb */}
        <div 
          className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 rounded-full blur-3xl opacity-25"
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent) / 0.5) 0%, transparent 70%)',
            animation: 'onboarding-float 25s ease-in-out infinite reverse',
          }}
        />
        {/* Center glow */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 rounded-full blur-3xl opacity-15"
          style={{
            background: 'radial-gradient(circle, hsl(var(--neon-purple) / 0.4) 0%, transparent 60%)',
            animation: 'onboarding-pulse 8s ease-in-out infinite',
          }}
        />
        {/* CSS keyframes */}
        <style>{`
          @keyframes onboarding-float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(5%, 10%) scale(1.05); }
            50% { transform: translate(-5%, 5%) scale(0.95); }
            75% { transform: translate(10%, -5%) scale(1.02); }
          }
          @keyframes onboarding-pulse {
            0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.25; transform: translate(-50%, -50%) scale(1.1); }
          }
        `}</style>
      </div>

      {/* Header */}
      <header className="relative z-10 p-3 sm:p-4 flex items-center justify-between flex-shrink-0">
        <VYBELogo size="md" />
        <Button variant="ghost" onClick={handleSkip} disabled={loading} className="text-muted-foreground text-sm sm:text-base">
          {t('onboarding.skip')}
        </Button>
      </header>

      {/* Progress bar */}
      <div className="relative z-10 px-3 sm:px-4 py-2 flex-shrink-0">
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

      {/* Content - scrollable area */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-3 sm:p-4">
          <div className="max-w-lg mx-auto pb-4">
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
                {/* Age step - new step before interests */}
                {(needsUsername ? step === 2 : step === 1) && (
                  <AgeSetup
                    value={dateOfBirth}
                    onChange={setDateOfBirth}
                    onAgeCalculated={setUserAge}
                  />
                )}
                {/* Regular steps - offset by 2 if username step exists, 1 otherwise */}
                {(needsUsername ? step === 3 : step === 2) && (
                  <InterestPicker selected={interests} onChange={setInterests} />
                )}
                {(needsUsername ? step === 4 : step === 3) && (
                  <CreatorSuggestions
                    interests={interests}
                    following={following}
                    onChange={setFollowing}
                  />
                )}
                {(needsUsername ? step === 5 : step === 4) && (
                  <ProfileSetup
                    data={profileData}
                    onChange={setProfileData}
                    username={needsUsername ? username : (profile?.username || '')}
                  />
                )}
                {(needsUsername ? step === 6 : step === 5) && (
                  <SensitivitySettings value={sensitivity} onChange={setSensitivity} userAge={userAge} />
                )}
                {(needsUsername ? step === 7 : step === 6) && (
                  <PrivacySettings isPrivate={isPrivate} onChange={setIsPrivate} />
                )}
                {(needsUsername ? step === 8 : step === 7) && (
                  <PermissionsSetup onAllRequiredGranted={setPermissionsGranted} />
                )}
                {(needsUsername ? step === 9 : step === 8) && (
                  <EmailVerification />
                )}
                {(needsUsername ? step === 10 : step === 9) && (
                  <LegalAcceptance accepted={legalAccepted} onChange={setLegalAccepted} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
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
              {loading ? 'Saving...' : 'Design your VYBE'}
              <VybeMiniIcon size={18} showSparkles />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
