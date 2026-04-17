import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, MailX, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Status = 'validating' | 'valid' | 'already' | 'invalid' | 'submitting' | 'success' | 'error';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('validating');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (data.valid) setStatus('valid');
        else if (data.reason === 'already_unsubscribed') setStatus('already');
        else setStatus('invalid');
      } catch {
        setStatus('invalid');
      }
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setStatus('submitting');
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setStatus('success');
      else if (data?.reason === 'already_unsubscribed') setStatus('already');
      else setStatus('error');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {status === 'success' || status === 'already' ? (
              <CheckCircle2 className="w-6 h-6 text-primary" />
            ) : status === 'invalid' || status === 'error' ? (
              <AlertCircle className="w-6 h-6 text-destructive" />
            ) : (
              <MailX className="w-6 h-6 text-primary" />
            )}
          </div>
          <CardTitle>Unsubscribe from emails</CardTitle>
          <CardDescription>
            {status === 'validating' && 'Checking your link…'}
            {status === 'valid' && 'Confirm to stop receiving emails from vybeapp.'}
            {status === 'submitting' && 'Processing…'}
            {status === 'success' && 'You’ve been unsubscribed.'}
            {status === 'already' && 'This email is already unsubscribed.'}
            {status === 'invalid' && 'This unsubscribe link is invalid or expired.'}
            {status === 'error' && (error || 'Something went wrong. Please try again.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {status === 'validating' || status === 'submitting' ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : status === 'valid' ? (
            <Button onClick={handleConfirm} variant="destructive">
              Confirm unsubscribe
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
