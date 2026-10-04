import { useState, useEffect, useCallback, useRef } from 'react';
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
import { getPostLoginPath } from '@/lib/authReturnPath';
import { db, firebaseStorage } from '@/lib/firebase';
import { updateUserProfile, getProfileByAuthUid } from '@/lib/firebase/users';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isIOSAppShell } from '@/lib/despiaBridge';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import {
  clearSignupUsername,
  isGeneratedUsername,
  isValidUsernameFormat,
  normalizeUsername,
  resolveSignupUsername,
} from '@/lib/username';
import {
  clearAppleProvidedName,
  isAppleAuthUser,
  readAppleProvidedName,
} from '@/lib/appleNameCapture';
import { savePrivateProfileDateOfBirth } from '@/lib/profilePrivate';

/** Lock document scroll + hide bottom nav (same shell pattern as Landing). */
function useOnboardingShell() {
  useEffect(() => {
    document.body.classList.add('hide-bottom-nav');
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.classList.remove('hide-bottom-nav');
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

async function ensureProfileRow(userId: string): Promise<void> {
  await db.rpc('ensure_profile');
  await db.rpc('claim_profile_by_email');

  const profile = await getProfileByAuthUid(userId);
  if (!profile?.id) {
    throw new Error('Could not create your profile. Please try again.');
  }
}

function buildSkipUsername(
  userId: string,
  usernameValid: boolean,
  username: string,
  signupUsername: string,
  profileUsername?: string | null,
): string {
  let candidate = normalizeUsername(
    usernameValid && username
      ? username
      : (signupUsername || profileUsername || username),
  );

  if (!candidate || isGeneratedUsername(candidate) || !isValidUsernameFormat(candidate)) {
    candidate = normalizeUsername(`vybe_${userId.replace(/-/g, '').slice(0, 10)}`);
  }

  return candidate;
}

async function persistOnboardingSkip(
  userId: string,
  desiredUsername: string,
): Promise<{ username: string; error: Error | null }> {
  await ensureProfileRow(userId);

  const { data: syncedUsername } = await (db as any).rpc('sync_signup_username');
  let finalUsername = desiredUsername;
  if (
    typeof syncedUsername === 'string' &&
    syncedUsername &&
    !isGeneratedUsername(syncedUsername) &&
    isValidUsernameFormat(normalizeUsername(syncedUsername))
  ) {
    finalUsername = normalizeUsername(syncedUsername);
  }

  const runUpdate = async (uname: string) => {
    try {
      await updateUserProfile(userId, { onboarding_completed: true, username: uname });
      return { data: { username: uname }, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  };

  let { data, error } = await runUpdate(finalUsername);

  if (error?.code === '23505') {
    finalUsername = normalizeUsername(
      `vybe_${userId.replace(/-/g, '').slice(0, 8)}${Math.floor(Math.random() * 9000 + 1000)}`,
    );
    ({ data, error } = await runUpdate(finalUsername));
  }

  if (error) {
    return { username: finalUsername, error: error as Error };
  }

  if (!data) {
    return {
      username: finalUsername,
      error: new Error('Profile update did not apply. Please try again.'),
    };
  }

  if (data.username) {
    finalUsername = normalizeUsername(data.username);
  }

  return { username: finalUsername, error: null };
}

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
  const { profile, user, refreshProfile } = useAuth();
  useOnboardingShell();
  // iOS WebView: drop y/scale step motion + looping blur glows (cause rubber-band jank).
  const calmIos = isIOSAppShell() || isNativePerfMode();

  const signupUsername = resolveSignupUsername(user?.user_metadata);
  // Latch needsUsername once profile first hydrates — flipping mid-flow remaps
  // getActualStep() and makes Next look like a flicker to the wrong screen.
  const needsUsernameLatchRef = useRef<boolean | null>(null);
  if (needsUsernameLatchRef.current === null && profile != null) {
    needsUsernameLatchRef.current = isGeneratedUsername(profile.username);
  }
  const needsUsername =
    needsUsernameLatchRef.current !== null
      ? needsUsernameLatchRef.current
      : isGeneratedUsername(profile?.username);
  // 4 core steps (or 5 if username needed): Username? → Birthday → Interests → Profile → Terms
  const TOTAL_STEPS = needsUsername ? 5 : 4;
  
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
  const pendingDesignerRef = useRef(false);

  // Stale disk cache can show onboarding_completed=false while DB is true — re-fetch before trapping user here.
  // Never redirect away while "Design your VYBE" (AI designer) is showing or about to show.
  useEffect(() => {
    if (!user || showAIDesigner || pendingDesignerRef.current) return;
    let cancelled = false;
    void (async () => {
      const fresh = await refreshProfile();
      if (cancelled || !fresh) return;
      if (fresh.onboarding_completed === true) {
        navigate(getPostLoginPath('/home'), { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, refreshProfile, navigate, showAIDesigner]);

  // Pre-fill username from signup metadata when profile got a generated placeholder.
  useEffect(() => {
    if (!signupUsername || username) return;
    setUsername(signupUsername);
    setUsernameValid(true);
  }, [signupUsername, username]);

  // Seed display name from existing profile only — never copy @username into display name.
  const seededDisplayNameRef = useRef(false);
  useEffect(() => {
    if (seededDisplayNameRef.current) return;
    const appleName = readAppleProvidedName();
    const existingDisplay = profile?.display_name?.trim();
    const existingFirst = (profile as { first_name?: string } | null)?.first_name?.trim() || '';
    const existingLast = (profile as { last_name?: string } | null)?.last_name?.trim() || '';
    const metaName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim();

    if (appleName || existingDisplay || existingFirst || existingLast || metaName) {
      seededDisplayNameRef.current = true;
      setProfileData((prev) => ({
        ...prev,
        firstName: prev.firstName || appleName?.firstName || existingFirst || '',
        lastName: prev.lastName || appleName?.lastName || existingLast || '',
        displayName:
          prev.displayName ||
          appleName?.displayName ||
          existingDisplay ||
          metaName ||
          '',
      }));
    }
  }, [profile?.display_name, profile, user?.user_metadata?.full_name, user?.user_metadata?.name]);

  const appleUser = isAppleAuthUser(user);

  // Mark username valid when user already has a real handle (non-OAuth placeholder).
  useEffect(() => {
    if (needsUsername) return;
    const existing = normalizeUsername(profile?.username || signupUsername || '');
    if (existing && !isGeneratedUsername(existing) && isValidUsernameFormat(existing)) {
      setUsername(existing);
      setUsernameValid(true);
    }
  }, [needsUsername, profile?.username, signupUsername]);

  // Step mapping (actual content step)
  const getActualStep = () => needsUsername ? step : step + 1;

  const canProceed = useCallback(() => {
    const s = getActualStep();
    switch (s) {
      case 1: return usernameValid; // Username
      case 2: return dateOfBirth !== null && (userAge === undefined || userAge >= 0); // Age (all ages allowed, under-13 gets parental controls)
      case 3: return interests.length >= 3; // Interests
      case 4: {
        // Guideline 4 / SIWA: do not re-require name Apple already provided (or skip name when Apple auth).
        if (appleUser) {
          return usernameValid;
        }
        return (
          usernameValid &&
          profileData.displayName.trim().length > 0 &&
          profileData.firstName.length > 0 &&
          profileData.lastName.length > 0
        );
      }
      case 5: return legalAccepted; // Legal
      default: return true;
    }
  }, [
    step,
    needsUsername,
    usernameValid,
    dateOfBirth,
    userAge,
    interests.length,
    profileData.displayName,
    profileData.firstName.length,
    profileData.lastName.length,
    legalAccepted,
    appleUser,
  ]);

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
        const fileName = `${Date.now()}.${fileExt}`;
        const storagePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await db.storage
          .from('avatars')
          .upload(storagePath, profileData.avatarFile);

        if (uploadError) {
          console.warn('[Onboarding] Avatar upload failed:', uploadError.message);
        } else {
          avatarUrl = await firebaseStorage.resolveDownloadUrl('avatars', storagePath);
        }
      }

      const chosenUsername = normalizeUsername(
        usernameValid && username
          ? username
          : needsUsername
            ? normalizeUsername(username)
            : normalizeUsername(profile?.username || signupUsername),
      );

      if (!chosenUsername || isGeneratedUsername(chosenUsername)) {
        toast.error('Please choose a username before continuing.');
        setLoading(false);
        return;
      }

      const finalUsername = chosenUsername;
      const appleStash = readAppleProvidedName();
      const trimmedDisplay = profileData.displayName.trim();
      const finalDisplayName =
        trimmedDisplay ||
        appleStash?.displayName ||
        [profileData.firstName || appleStash?.firstName, profileData.lastName || appleStash?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        finalUsername;

      await ensureProfileRow(user.id);
      const ensuredProfile = await getProfileByAuthUid(user.id);
      if (!ensuredProfile?.id) {
        throw new Error('Could not load your profile. Please try again.');
      }
      const privateDateOfBirth = dateOfBirth?.toISOString().split('T')[0] || '';
      if (privateDateOfBirth) {
        await savePrivateProfileDateOfBirth({
          profileId: ensuredProfile.id,
          authUid: user.id,
          dateOfBirth: privateDateOfBirth,
        });
      }

      await updateUserProfile(user.id, {
        username: finalUsername?.toLowerCase(),
        first_name: profileData.firstName || appleStash?.firstName || '',
        last_name: profileData.lastName || appleStash?.lastName || '',
        display_name: finalDisplayName,
        bio: profileData.bio,
        link_url: profileData.linkUrl,
        avatar_url: avatarUrl,
        interests: interests,
        onboarding_completed: true,
      } as any);

      if (legalAccepted) {
        const { error: legalError } = await db.from('legal_acceptances').upsert([
          { user_id: user.id, document_type: 'tos', document_version: '2.0' },
          { user_id: user.id, document_type: 'privacy', document_version: '2.0' },
        ], { onConflict: 'user_id,document_type,document_version' });
        if (legalError) {
          console.warn('[Onboarding] Legal acceptance save failed:', legalError.message);
        }
      }

      clearAppleProvidedName();
      clearSignupUsername();

      await refreshProfile();

      setLoading(false);
      haptics.success();
      pendingDesignerRef.current = true;
      setShowAIDesigner(true);
    } catch (error) {
      console.error('Onboarding error:', error);
      haptics.error();
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      toast.error(
        import.meta.env.DEV ? message : 'Something went wrong. Please try again.',
      );
      setLoading(false);
    }
  };

  const handleDesignerComplete = async () => {
    pendingDesignerRef.current = false;
    await refreshProfile();
    console.log('[Onboarding] Completed, dispatching event');
    window.dispatchEvent(new CustomEvent('onboarding-completed'));
    toast.success('Welcome to VYBE! 🎉');
    
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate('home');
    } else {
      navigate(getPostLoginPath('/home'), { replace: true });
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
    toast.info('You can finish your profile anytime in Settings.');
    try {
      const desiredUsername = buildSkipUsername(
        user.id,
        usernameValid,
        username,
        signupUsername,
        profile?.username,
      );

      const { username: finalUsername, error } = await persistOnboardingSkip(user.id, desiredUsername);

      if (error) {
        console.error('Skip save error:', error);
        toast.error(
          import.meta.env.DEV
            ? `Could not save profile: ${error.message}`
            : 'Could not save profile. Please try again.',
        );
        return;
      }

      clearSignupUsername();
      await refreshProfile();
      window.dispatchEvent(new CustomEvent('onboarding-completed'));

      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate(getPostLoginPath('/home'), { replace: true });
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
            username={needsUsername ? username : (username || profile?.username || signupUsername || '')}
            onUsernameChange={setUsername}
            onUsernameValidChange={setUsernameValid}
            authUserId={user?.id}
            nameOptional={appleUser}
          />
        );
      case 5:
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
    <motion.div
      initial={calmIos ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: calmIos ? 0.2 : 0.4, ease: EASE_OUT_EXPO }}
      className="fixed inset-0 z-40 h-[100dvh] max-h-[100dvh] w-full bg-background flex flex-col overflow-hidden overscroll-none relative touch-pan-y"
    >
      {loading && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Saving…</p>
        </div>
      )}
      {/* Ambient — static on iOS; soft opacity pulse elsewhere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.45) 0%, transparent 70%)',
            filter: calmIos ? 'blur(40px)' : 'blur(60px)',
            opacity: 0.26,
            animation: calmIos ? 'none' : 'ob-glow-a 8s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent) / 0.35) 0%, transparent 70%)',
            filter: calmIos ? 'blur(40px)' : 'blur(60px)',
            opacity: 0.2,
            animation: calmIos ? 'none' : 'ob-glow-b 10s ease-in-out infinite alternate',
          }}
        />
        {!calmIos && (
          <style>{`@keyframes ob-glow-a{0%{opacity:.22}100%{opacity:.32}}@keyframes ob-glow-b{0%{opacity:.15}100%{opacity:.25}}`}</style>
        )}
      </div>

      {/* Header — safe-area top so notch inset isn’t guessed elsewhere */}
      <header className="relative z-10 px-3 sm:px-4 pt-[max(0.75rem,var(--sat,env(safe-area-inset-top,0px)))] pb-2 flex items-center justify-between flex-shrink-0">
        <VYBELogo size="md" />
        <Button variant="ghost" onClick={handleSkip} disabled={loading} className="text-muted-foreground text-sm">
          {t('onboarding.skip')}
        </Button>
      </header>

      {/* Progress — dot indicators + step label */}
      <div className="relative z-10 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <motion.div
              key={i}
              className="h-1.5 rounded-full"
              animate={{
                width: i + 1 === step ? 32 : 16,
                backgroundColor: i + 1 === step ? 'hsl(var(--primary))' : i + 1 < step ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--muted))',
              }}
              transition={{ duration: calmIos ? 0.2 : 0.35, ease: EASE_OUT_EXPO }}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {currentLabel}
        </p>
      </div>

      {/* Content — only this region scrolls; body stays locked */}
      <main
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
        style={{ touchAction: 'pan-y' }}
      >
        <div className="p-3 sm:p-4">
          <div className="max-w-lg mx-auto pb-4">
            {calmIos ? (
              // Instant swap in Despia/iOS — exit+enter AnimatePresence blanks a frame.
              <div key={step}>{renderStep()}</div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-3 sm:px-4 pt-3 pb-[max(0.75rem,var(--sab,env(safe-area-inset-bottom,0px)))] border-t border-border bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm flex-shrink-0">
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
    </motion.div>
  );
}
