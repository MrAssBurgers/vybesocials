/**
 * Maps internal error messages to user-friendly messages
 * Prevents leaking database schema, constraint names, and internal details
 */

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const e = error as { code?: string; name?: string };
  return String(e.code || e.name || '');
}

/** Firebase / OAuth-focused friendly message (also used by auth service facade). */
export function getFriendlyAuthError(error: unknown): string {
  const code = authErrorCode(error);
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message || '')
      : typeof error === 'string'
        ? error
        : '';

  switch (code) {
    case 'auth/unauthorized-domain':
      return 'This domain is not approved for sign-in.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Redirecting to sign in.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '__SUPPRESS__';
    case 'auth/network-request-failed':
      return 'VYBE could not reach the sign-in service. Check your connection.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using another sign-in method. Sign in with that method, then link Google or Apple in Settings → Connections.';
    case 'auth/credential-already-in-use':
      return 'This sign-in method is already linked to another account. Sign in with that method, then link providers in Settings → Connections.';
    case 'auth/invalid-credential':
      // Prefer actionable Apple/console copy from appleSignIn when present.
      if (/Apple|Services ID|native-callback/i.test(message)) return message;
      return 'Sign-in credentials were invalid or expired. Try again.';
    case 'auth/invalid-oauth-provider':
      return 'This sign-in provider is misconfigured. Contact support.';
    case 'auth/web-storage-unsupported':
      return 'This browser blocked sign-in storage. Disable private mode and try again.';
    case 'auth/internal-error':
      return 'Sign-in failed due to an internal error. Try again in a moment.';
    case 'apple/sdk-missing':
      return 'Apple Sign-In is unavailable right now. Check your connection and try again.';
    case 'apple/missing-token':
      return 'Apple Sign-In did not finish. Try again.';
    case 'apple/incomplete':
      return 'Apple Sign-In did not finish. Try again, or use email login.';
    case 'despia/oauth-timeout':
      return 'Sign-in did not return to the app. Close any leftover browser sheet and try again.';
    case 'despia/oauth-redeem-failed':
    case 'despia/oauth-error':
    case 'despia/oauth-launch-failed':
      // Benign race: App Link + nonce poll both hit the same one-time hc=.
      if (/already used|expired or already used/i.test(message)) return '__SUPPRESS__';
      return message || 'Sign-in could not finish in the app. Close any leftover browser sheet and try again.';
    case 'vybe/oauth-busy':
      return '__SUPPRESS__';
    default:
      break;
  }

  if (/already used|expired or already used/i.test(message)) {
    return '__SUPPRESS__';
  }
  if (
    message.includes('Sign in was cancelled') ||
    message.toLowerCase().includes('cancelled by the user') ||
    message === 'Sign-in cancelled' ||
    message === 'Sign-in was cancelled or incomplete.'
  ) {
    return '__SUPPRESS__';
  }
  if (message.includes('Popup was blocked')) {
    return 'Your browser blocked the sign-in window. Redirecting to sign in.';
  }
  if (message.includes('unauthorized-domain')) {
    return 'This domain is not approved for sign-in.';
  }
  if (
    message.includes('operation-not-allowed') ||
    message.toLowerCase().includes('code flow is not enabled for apple')
  ) {
    return 'This sign-in provider is not enabled.';
  }
  if (
    message.includes('403') ||
    message.toLowerCase().includes('forbidden') ||
    message.toLowerCase().includes('invalid_client')
  ) {
    return 'Apple rejected sign-in. Confirm Services ID com.despia.vybe.web and return URL https://vybehub.app/native-callback.html.';
  }
  if (/Services ID|native-callback\.html/i.test(message)) {
    return message;
  }

  if (code.startsWith('auth/') || code.startsWith('apple/') || code.startsWith('despia/')) {
    if (message && message !== '[object Object]') return message;
    return `Sign-in failed. Error code: ${code}`;
  }

  // Prefer a real message over the generic fallback.
  if (message && message !== '[object Object]' && message.length > 3) {
    return message;
  }

  return getUserFriendlyError(error);
}

export function getUserFriendlyError(error: any): string {
  const message = error?.message || error?.toString() || '';
  const code = authErrorCode(error);

  // Prefer the OAuth-specific mapper when Firebase auth codes are present.
  if (code.startsWith('auth/')) {
    return getFriendlyAuthError(error);
  }
  
  // OAuth popup errors (mobile browsers can't reliably use popups)
  if (
    message.includes('Sign in was cancelled') ||
    error?.code === 'auth/popup-closed-by-user' ||
    error?.name === 'auth/popup-closed-by-user'
  ) {
    return '__SUPPRESS__'; // Not a real error — user closed popup or mobile suspended tab
  }
  if (
    message.includes('Popup was blocked') ||
    error?.code === 'auth/popup-blocked' ||
    error?.name === 'auth/popup-blocked'
  ) {
    return 'Your browser blocked the sign-in window. Redirecting to sign in.';
  }
  if (
    error?.code === 'auth/unauthorized-domain' ||
    error?.name === 'auth/unauthorized-domain' ||
    message.includes('unauthorized-domain')
  ) {
    return 'This domain is not approved for sign-in.';
  }
  if (
    message.includes('403') ||
    message.toLowerCase().includes('forbidden')
  ) {
    return 'Apple rejected sign-in (403). Check that Firebase Services ID matches your Apple Services ID (not the App ID).';
  }
  if (
    error?.code === 'auth/operation-not-allowed' ||
    error?.name === 'auth/operation-not-allowed' ||
    message.includes('operation-not-allowed') ||
    message.toLowerCase().includes('code flow is not enabled for apple')
  ) {
    return 'This sign-in provider is not enabled.';
  }
  if (
    error?.code === 'auth/account-exists-with-different-credential' ||
    error?.name === 'auth/account-exists-with-different-credential'
  ) {
    return 'An account already exists with this email using another sign-in method.';
  }
  
  // Authentication errors
  if (
    message.includes('Invalid login credentials') ||
    message.includes('auth/invalid-credential') ||
    message.includes('auth/invalid-login-credentials') ||
    message.includes('auth/wrong-password')
  ) {
    return 'VYBE was upgraded — your old password will not work. Tap Forgot password to set a new one, or sign in with Google or Apple if you used those.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please verify your email address. Check your inbox or tap "Resend verification".';
  }
  if (
    message.includes('auth/expired-action-code') ||
    message.includes('auth/invalid-action-code') ||
    (message.toLowerCase().includes('reset') && message.toLowerCase().includes('expired'))
  ) {
    return 'This reset link has expired. Request a new one from the login page.';
  }
  if (message.includes('Email link is invalid') || message.includes('expired')) {
    return 'This verification link has expired. Tap "Resend verification" to get a new one.';
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (message.includes('already confirmed') || error?.code === 'email_already_confirmed') {
    return 'This email is already verified — just sign in.';
  }
  if (message.includes('User not found') || error?.code === 'user_not_found') {
    return 'No account found for this email. Create one first.';
  }
  if (message.toLowerCase().includes('invalid') && message.toLowerCase().includes('email')) {
    return 'That email address looks invalid. Double-check it and try again.';
  }
  if (
    message.includes('Password reset email is not configured') ||
    message.includes('Failed to send password reset email') ||
    (error?.code === 'failed-precondition' && message.toLowerCase().includes('password reset'))
  ) {
    return "We couldn't send the reset email right now. Please try again in a moment or contact support.";
  }
  if (
    message.includes('auth/invalid-continue-uri') ||
    message.includes('invalid-continue-uri') ||
    message.includes('unauthorized-continue-uri')
  ) {
    return "We couldn't send the reset email right now. Please try again in a moment or contact support.";
  }
  if (
    error?.code === 'over_email_send_rate_limit' ||
    error?.status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('Too Many')
  ) {
    return 'Too many attempts — please wait a minute before trying again.';
  }
  if (
    message.toLowerCase().includes('smtp') ||
    message.includes('email service') ||
    message.includes('Error sending')
  ) {
    return "We couldn't send the email right now. Please try again in a moment.";
  }
  if (message.includes('Password should be at least') || message.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (
    error?.code === 'weak_password' ||
    message.includes('known to be weak') ||
    message.includes('easy to guess') ||
    message.includes('pwned')
  ) {
    return 'Choose a stronger password that has not been used in a data breach.';
  }
  if (message.includes('password') && message.includes('leaked') || message.includes('HIBP')) {
    return 'This password has been found in a data breach. Please choose a different one.';
  }
  
  // Database constraint errors
  if (error?.code === '23505' || message.includes('unique constraint') || message.includes('duplicate key')) {
    if (message.includes('username')) {
      return 'This username is already taken.';
    }
    if (message.includes('email')) {
      return 'This email is already registered.';
    }
    return 'This item already exists.';
  }
  
  // RLS policy errors
  if (message.includes('row-level security') || message.includes('RLS')) {
    return 'You do not have permission to perform this action.';
  }
  
  // Network/connection errors
  if (
    error?.code === 'auth/network-request-failed' ||
    error?.name === 'auth/network-request-failed'
  ) {
    return 'Could not reach the sign-in server. Check your connection and try again.';
  }
  if (
    error?.code === 'auth/timeout' ||
    error?.name === 'auth/timeout' ||
    message.includes('timed out')
  ) {
    return 'Sign-in timed out. Check your connection and try again.';
  }
  if (
    error?.code === 'auth/app-check-token-invalid' ||
    error?.name === 'auth/app-check-token-invalid' ||
    message.includes('app check')
  ) {
    return 'Security check failed. Refresh the page and try again.';
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
    return 'Connection error. Please check your internet and try again.';
  }
  
  // File upload errors
  if (message.includes('file') || message.includes('storage') || message.includes('upload')) {
    return 'Failed to upload file. Please try again.';
  }
  
  // User input validation (pass through since these are user-facing)
  if (message.includes('required') || message.includes('Username is required')) {
    return message;
  }
  
  // Generic fallback — surface auth-like codes when present
  console.error('Unhandled error:', error);
  if (code) return `Sign-in failed. Error code: ${code}`;
  return 'Sign-in failed. Please try again.';
}
