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
import { updateUserProfile, ensureUserProfile } from '@/lib/firebase/users';
import { batchSet } from '@/lib/firebase/firestoreDb';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import AccountProfileStatus from '@/components/auth/AccountProfileStatus';
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
} from '@/lib/username';
import {
  clearAppleProvidedName,
  isAppleAuthUser,
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
  guard: () => void,
): Promise<void> {
  await ensureUserProfile(userId, undefined, guard);
  guard();
  let finalUsername = desiredUsername;
  try {
    await updateUserProfile(userId, { onboarding_completed: true, username: finalUsername }, guard);
  } catch (error) {
    guard();
    if (!(error && typeof error === 'object' && 'code' in error && error.code === '23505')) throw error;
    finalUsername = normalizeUsername(
      `vybe_${userId.replace(/-/g, '').slice(0, 8)}${Math.floor(Math.random() * 9000 + 1000)}`,
    );
    await updateUserProfile(userId, { onboarding_completed: true, username: finalUsername }, guard);
  }
  guard();
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
export default function Onboarding(props: OnboardingProps) {
  const { user, profile, profileSetupError } = useAuth();
  const session = useReportAccountSession();
  if (!user || session.uid !== user.id || !profile?.id || profile.user_id !== user.id || profileSetupError) {
    return <AccountProfileStatus />;
  }
  return <OnboardingFlow key={`${session.uid}:${session.epoch}`} {...props} />;
}

function OnboardingFlow({ onInviteNavigate, isInviteMode = false }: OnboardingProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  useOnboardingShell();
  // iOS WebView: drop y/scale step motion + looping blur glows (cause rubber-band jank).
  const calmIos = isIOSAppShell() || isNativePerfMode();

  // The browser-wide legacy stashes have no account provenance. Only seed this
  // form from the current Auth account or its verified owned profile.
  const signupUsername = normalizeUsername(typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : '');
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
  const [saveError, setSaveError] = useState('');
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const avatarAttemptRef = useRef<{ file: File; path: string; url?: string }>();
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const captureGuard = () => profileAccountGuard(user?.id || '', () => {
    if (!activeRef.current) throw new Error('Profile setup closed.');
  });
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

  // This form only mounts with a checked current profile. Re-reading it here
  // would duplicate bootstrap and delay returning users on every sign-in.
  useEffect(() => {
    if (!user || showAIDesigner || pendingDesignerRef.current || busyRef.current) return;
    try {
      captureGuard()();
      if (profile?.user_id === user.id && profile.onboarding_completed === true) {
        navigate(getPostLoginPath('/home'), { replace: true });
      }
    } catch { /* The account gate owns replacement sessions. */ }
  }, [user?.id, profile?.user_id, profile?.onboarding_completed, navigate, showAIDesigner]);

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
    const existingDisplay = profile?.display_name?.trim();
    const existingFirst = (profile as { first_name?: string } | null)?.first_name?.trim() || '';
    const existingLast = (profile as { last_name?: string } | null)?.last_name?.trim() || '';
    const metaName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim();

    if (existingDisplay || existingFirst || existingLast || metaName) {
      seededDisplayNameRef.current = true;
      setProfileData((prev) => ({
        ...prev,
        firstName: prev.firstName || existingFirst || '',
        lastName: prev.lastName || existingLast || '',
        displayName:
          prev.displayName ||
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
    if (busyRef.current || !canProceed()) return;
    haptics.impact();
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (busyRef.current) return;
    haptics.tap();
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinish = async () => {
    if (!user || busyRef.current || !legalAccepted || !canProceed()) return;
    let guard: () => void;
    try { guard = captureGuard(); } catch { return; }
    busyRef.current = true;
    setLoading(true);
    setSaveError('');
    haptics.impact();
    try {
      const chosenUsername = normalizeUsername(
        usernameValid && username
          ? username
          : needsUsername
            ? normalizeUsername(username)
            : normalizeUsername(profile?.username || signupUsername),
      );

      if (!chosenUsername || isGeneratedUsername(chosenUsername) || !isValidUsernameFormat(chosenUsername)) {
        throw new Error('Please choose a valid username before continuing.');
      }

      const finalUsername = chosenUsername;
      const trimmedDisplay = profileData.displayName.trim();
      const finalDisplayName =
        trimmedDisplay ||
        [profileData.firstName, profileData.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        finalUsername;

      const ensuredProfile = await ensureUserProfile(user.id, undefined, guard);
      guard();
      if (!ensuredProfile?.id || ensuredProfile.user_id !== user.id) {
        throw new Error('Could not load your profile. Please try again.');
      }
      let avatarUrl = profile?.avatar_url || null;
      if (profileData.avatarFile) {
        const file = profileData.avatarFile;
        if (avatarAttemptRef.current?.file !== file) {
          const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
          avatarAttemptRef.current = { file, path: `${user.id}/${crypto.randomUUID()}.${extension}` };
        }
        const attempt = avatarAttemptRef.current;
        if (!attempt.url) {
          guard();
          const { error } = await db.storage.from('avatars').upload(attempt.path, file);
          guard();
          if (error) throw new Error('Your photo could not be uploaded. Please try again.');
          const url = await firebaseStorage.resolveDownloadUrl('avatars', attempt.path);
          guard();
          if (!url) throw new Error('Your photo could not be loaded. Please try again.');
          attempt.url = url;
        }
        avatarUrl = attempt.url;
      }
      const privateDateOfBirth = dateOfBirth?.toISOString().split('T')[0] || '';
      if (privateDateOfBirth) {
        await savePrivateProfileDateOfBirth({
          profileId: ensuredProfile.id,
          authUid: user.id,
          dateOfBirth: privateDateOfBirth,
        }, guard);
        guard();
      }

      // Completion is written last. Failed photo/private/legal saves must not
      // redirect a user into Home with an unfinished profile.
      guard();
      await batchSet('legal_acceptances', ['tos', 'privacy'].map(documentType => ({
        id: `${user.id}_${documentType}_2.0`,
        data: { user_id: user.id, document_type: documentType, document_version: '2.0' },
      })));
      guard();
      pendingDesignerRef.current = true;
      await updateUserProfile(user.id, {
        username: finalUsername?.toLowerCase(),
        first_name: profileData.firstName || '',
        last_name: profileData.lastName || '',
        display_name: finalDisplayName,
        bio: profileData.bio,
        link_url: profileData.linkUrl,
        avatar_url: avatarUrl,
        interests: interests,
        onboarding_completed: true,
      }, guard);
      guard();
      clearAppleProvidedName();
      clearSignupUsername();

      const fresh = await refreshProfile();
      guard();
      if (fresh?.user_id !== user.id || fresh.onboarding_completed !== true) throw new Error('Profile confirmation failed.');
      haptics.success();
      setShowAIDesigner(true);
    } catch (error) {
      try { guard(); } catch { return; }
      pendingDesignerRef.current = false;
      haptics.error();
      const message = error instanceof Error && /^(Please choose|Your photo|Could not load)/.test(error.message)
        ? error.message : 'Your profile could not be saved. Your choices are still here — please try again.';
      setSaveError(message);
      toast.error(message);
    } finally {
      busyRef.current = false;
      if (activeRef.current) setLoading(false);
    }
  };

  const handleDesignerComplete = async () => {
    if (busyRef.current) return;
    let guard: () => void;
    try { guard = captureGuard(); } catch { return; }
    busyRef.current = true;
    try {
      const fresh = await refreshProfile();
      guard();
      if (fresh?.user_id !== user?.id || fresh?.onboarding_completed !== true) throw new Error('Profile confirmation failed.');
    } catch {
      busyRef.current = false;
      try { guard(); toast.error('Your profile could not be confirmed. Please try again.'); } catch { /* retired */ }
      return;
    }
    pendingDesignerRef.current = false;
    window.dispatchEvent(new CustomEvent('onboarding-completed'));
    toast.success('Welcome to VYBE! 🎉');
    
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate('home');
    } else {
      navigate(getPostLoginPath('/home'), { replace: true });
    }
  };

  const handleSkip = async () => {
    if (!user || busyRef.current) return;
    let guard: () => void;
    try { guard = captureGuard(); } catch { return; }
    busyRef.current = true;
    setLoading(true);
    setSaveError('');
    haptics.tap();
    try {
      const desiredUsername = buildSkipUsername(
        user.id,
        usernameValid,
        username,
        signupUsername,
        profile?.username,
      );

      await persistOnboardingSkip(user.id, desiredUsername, guard);
      guard();
      clearSignupUsername();
      const fresh = await refreshProfile();
      guard();
      if (fresh?.user_id !== user.id || fresh.onboarding_completed !== true) throw new Error('Profile confirmation failed.');
      window.dispatchEvent(new CustomEvent('onboarding-completed'));
      toast.info('You can finish your profile anytime in Settings.');

      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate('home');
      } else {
        navigate(getPostLoginPath('/home'), { replace: true });
      }
    } catch {
      try { guard(); } catch { return; }
      setSaveError('Your profile could not be saved. Please try again.');
      toast.error('Your profile could not be saved. Please try again.');
    } finally {
      busyRef.current = false;
      if (activeRef.current) setLoading(false);
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
            {saveError && <p role="alert" className="mb-4 rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm">{saveError}</p>}
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
            disabled={loading || step === 1}
            className="flex items-center gap-1.5 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={handleNext}
              disabled={loading || !canProceed()}
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
