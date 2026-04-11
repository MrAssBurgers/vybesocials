/**
 * Maps internal error messages to user-friendly messages
 * Prevents leaking database schema, constraint names, and internal details
 */
export function getUserFriendlyError(error: any): string {
  const message = error?.message || error?.toString() || '';
  
  // OAuth popup errors (mobile browsers can't reliably use popups)
  if (message.includes('Sign in was cancelled')) {
    return '__SUPPRESS__'; // Not a real error — user closed popup or mobile suspended tab
  }
  if (message.includes('Popup was blocked')) {
    return 'Pop-up blocked. Try opening the app in a new browser tab to sign in.';
  }
  
  // Authentication errors
  if (message.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please try again.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please verify your email address.';
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (message.includes('Password should be at least') || message.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
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
