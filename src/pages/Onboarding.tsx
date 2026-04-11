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
import { AgeSetup } from '@/components/onboarding/AgeSetup';
import { AIVybeDesigner } from '@/components/onboarding/AIVybeDesigner';
import { LegalAcceptance } from '@/components/onboarding/LegalAcceptance';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

// Invite mode stage type - must match InviteRedeem state machine
type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

interface OnboardingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

/**
 * Streamlined 5-step onboarding:
 * 1. Username (if needed, e.g. Google OAuth)
 * 2. Birthday/Age
 * 3. Pick interests (+ follow suggested creators inline)
 * 4. Profile setup (name, avatar, bio)
 * 5. Legal acceptance
 * 
 * Post-onboarding (moved to Settings): Sensitivity, Privacy, Permissions, Email verification
 */
export default function Onboarding({ onInviteNavigate, isInviteMode = false }: OnboardingProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  
  const needsUsername = !profile?.username;
  // 5 core steps (or 6 if username needed)
  const TOTAL_STEPS = needsUsername ? 6 : 5;
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [usernameValid, setUsernameValid] = useState(false);
  const [showAIDesigner, setShowAIDesigner] = useState(false);
  const [showCreators, setShowCreators] = useState(false);

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
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    const name = needsUsername ? username : profile?.username;
    if (name) {
      setProfileData(prev => ({ ...prev, displayName: name }));
    }
  }, [username, profile?.username, needsUsername]);

  // Step mapping (actual content step)
  const getActualStep = () => needsUsername ? step : step + 1;

  const canProceed = useCallback(() => {
    const s = getActualStep();
    switch (s) {
      case 1: return usernameValid; // Username
      case 2: return dateOfBirth !== null && (userAge === undefined || userAge >= 13); // Age
      case 3: return interests.length >= 3; // Interests
      case 4: return profileData.firstName.length > 0 && profileData.lastName.length > 0; // Profile
      case 5: return legalAccepted; // Legal
      case 6: return legalAccepted; // Legal (when username step exists)
      default: return true;
    }
  }, [step, needsUsername, usernameValid, dateOfBirth, userAge, interests.length, profileData.firstName.length, profileData.lastName.length, legalAccepted]);

  const handleNext = () => {
    haptics.impact();
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    haptics.tap();
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    
    setLoading(true);
    haptics.impact();
    try {
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

      const finalUsername = needsUsername ? username : profile?.username;
      const finalDisplayName = profileData.displayName && profileData.displayName !== '' 
        ? profileData.displayName 
        : finalUsername || '';

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
          date_of_birth: dateOfBirth?.toISOString().split('T')[0] || null,
          onboarding_completed: true,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        if (error.code === '23505' && error.message?.includes('profiles_username_key')) {
          toast.error('That username is already taken. Please go back and choose another.');
          setLoading(false);
          return;
        }
        throw error;
      }

      if (legalAccepted) {
        await supabase.from('legal_acceptances').upsert([
          { user_id: user.id, document_type: 'tos', document_version: '2.0' },
          { user_id: user.id, document_type: 'privacy', document_version: '2.0' },
        ], { onConflict: 'user_id,document_type,document_version' });
      }

      setLoading(false);
      haptics.success();
      setShowAIDesigner(true);
    } catch (error) {
      console.error('Onboarding error:', error);
      haptics.error();
      toast.error('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

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
    if (loading) return;
    
    if (!user) {
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate('/home');
      }
      return;
    }

    setLoading(true);
    haptics.tap();
    try {
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const finalUsername = needsUsername && username 
        ? username.toLowerCase() 
        : profile?.username || `user_${user.id.substring(0, 6)}_${randomSuffix}`;

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
        if (error.code === '23505' && error.message?.includes('profiles_username_key')) {
          toast.error('Username conflict — please pick a custom username.');
        } else {
          console.error('Skip save error:', error);
          toast.error('Could not save profile. Please try again.');
        }
        return;
      }

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

  if (showAIDesigner) {
    return (
      <AIVybeDesigner
        interests={interests}
        onComplete={handleDesignerComplete}
        onSkip={handleDesignerComplete}
      />
    );
  }

  // Render the current step content
  const renderStep = () => {
    const s = getActualStep();
    switch (s) {
      case 1:
        return (
          <UsernameSetup
            username={username}
            onChange={setUsername}
            onValidChange={setUsernameValid}
          />
        );
      case 2:
        return (
          <AgeSetup
            value={dateOfBirth}
            onChange={setDateOfBirth}
            onAgeCalculated={setUserAge}
          />
        );
      case 3:
        return (
          <div className="space-y-6">
            <InterestPicker selected={interests} onChange={setInterests} />
            {interests.length >= 3 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowCreators(!showCreators)}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  {showCreators ? 'Hide suggested creators ↑' : 'Follow suggested creators →'}
                </button>
                {showCreators && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <CreatorSuggestions
                      interests={interests}
                      following={following}
                      onChange={setFollowing}
                    />
                  </motion.div>
                )}
              </div>
            )}
          </div>
        );
      case 4:
        return (
          <ProfileSetup
            data={profileData}
            onChange={setProfileData}
            username={needsUsername ? username : (profile?.username || '')}
          />
        );
      case 5:
      case 6:
        return <LegalAcceptance accepted={legalAccepted} onChange={setLegalAccepted} />;
      default:
        return null;
    }
  };

  // Step labels for the progress indicator
  const stepLabels = needsUsername
    ? ['Username', 'Birthday', 'Interests', 'Profile', 'Terms']
    : ['Birthday', 'Interests', 'Profile', 'Terms'];

  // Ensure we don't exceed the final step label
  const currentLabel = stepLabels[Math.min(step - 1, stepLabels.length - 1)] || '';

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 rounded-full blur-3xl opacity-30"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, transparent 70%)',
            animation: 'onboarding-float 20s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 rounded-full blur-3xl opacity-25"
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent) / 0.5) 0%, transparent 70%)',
            animation: 'onboarding-float 25s ease-in-out infinite reverse',
          }}
        />
        <style>{`
          @keyframes onboarding-float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(5%, 10%) scale(1.05); }
            50% { transform: translate(-5%, 5%) scale(0.95); }
            75% { transform: translate(10%, -5%) scale(1.02); }
          }
        `}</style>
      </div>

      {/* Header */}
      <header className="relative z-10 p-3 sm:p-4 flex items-center justify-between flex-shrink-0">
        <VYBELogo size="md" />
        <Button variant="ghost" onClick={handleSkip} disabled={loading} className="text-muted-foreground text-sm">
          {t('onboarding.skip')}
        </Button>
      </header>

      {/* Progress — dot indicators + step label */}
      <div className="relative z-10 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 === step
                  ? 'w-8 bg-primary'
                  : i + 1 < step
                  ? 'w-4 bg-primary/50'
                  : 'w-4 bg-muted'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {currentLabel}
        </p>
      </div>

      {/* Content */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-3 sm:p-4">
          <div className="max-w-lg mx-auto pb-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-3 sm:p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 gradient-animated text-sm"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={loading || !canProceed()}
              className="flex items-center gap-1.5 gradient-animated text-sm"
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
