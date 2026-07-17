/**
 * Platform eligibility for native iOS auth bridge.
 *
 * [iOS-only] Native auth is only for Despia iOS shells. Android App Link /
 * oauth:// path must remain unchanged.
 */
import { getRuntimeOs, isDespiaRuntime } from '@/lib/despiaBridge';
import type { NativeAuthProvider } from './types';

/** True when this runtime could ever use nativeauth:// (iOS Despia shell). */
export function isNativeAuthPlatformEligible(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isDespiaRuntime()) return false;
  return getRuntimeOs() === 'ios';
}

/** Providers supported by the native bridge contract. */
export function isNativeAuthProvider(provider: string): provider is NativeAuthProvider {
  return provider === 'apple' || provider === 'google';
}
