/**
 * Maps internal error messages to user-friendly messages
 * Prevents leaking database schema, constraint names, and internal details
 */
export function getUserFriendlyError(error: any): string {
  const message = error?.message || error?.toString() || '';
  
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
    return 'Pop-up blocked. Try opening the app in a new browser tab to sign in.';
  }
  if (
    error?.code === 'auth/unauthorized-domain' ||
    error?.name === 'auth/unauthorized-domain' ||
    message.includes('unauthorized-domain')
  ) {
    return 'This site is not authorized for Google sign-in yet. Try vybe-daaab.web.app or contact support.';
  }
  if (
    error?.code === 'auth/account-exists-with-different-credential' ||
    error?.name === 'auth/account-exists-with-different-credential'
  ) {
    return 'An account already exists with this email using a different sign-in method. Try email/password or the method you used originally.';
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
  
  // Generic fallback - don't expose internal error details
  console.error('Unhandled error:', error);
  return 'Something went wrong. Please try again.';
}
