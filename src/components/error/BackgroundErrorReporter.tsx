import { useErrorReporter } from '@/hooks/useErrorReporter';
import { useAutoBugReporter } from '@/hooks/useAutoBugReporter';

/** Reporting loads separately; screen recovery is available in the initial app. */
export default function BackgroundErrorReporter() {
  useErrorReporter();
  useAutoBugReporter();
  return null;
}
