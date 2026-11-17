import { useEffect, useRef, useState } from 'react';
import { checkUsernameAvailable } from '@/lib/usernameAvailability';

export function useOnboardingUsernameCheck(
  onChange: (username: string) => void,
  onValidChange: (valid: boolean) => void,
  authUserId?: string,
) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const request = useRef(0);

  useEffect(() => () => { request.current += 1; }, []);

  async function changeUsername(raw: string) {
    const value = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const current = ++request.current;
    onChange(value);
    onValidChange(false);
    setAvailable(null);
    setError(value.length > 0 && value.length < 3 ? 'Username must be at least 3 characters' : '');
    setChecking(value.length >= 3);
    if (value.length < 3) return;

    try {
      const result = await checkUsernameAvailable(value, authUserId);
      if (request.current !== current) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setAvailable(result.available);
      if (result.available) onValidChange(true);
      else setError('Username is already taken');
    } catch {
      if (request.current === current) setError('Error checking username');
    } finally {
      if (request.current === current) setChecking(false);
    }
  }

  return { changeUsername, checking, available, error };
}
