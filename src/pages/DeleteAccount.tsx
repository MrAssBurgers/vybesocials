import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AccountDangerZone } from '@/components/settings/AccountDangerZone';
import { useAuth } from '@/lib/auth';

export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    const previous = document.title;
    document.title = 'Account deletion request | VYBE';
    return () => { document.title = previous; };
  }, []);
  return <main className="min-h-screen bg-background relative z-10">
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
      <div className="space-y-2"><h1 className="text-2xl font-bold">Account deletion request</h1><p className="text-sm text-muted-foreground">Only your signed-in account can request or cancel deletion. Requests have a 30-day grace period before review. Permanent cleanup is not automatic yet.</p></div>
      {user ? <AccountDangerZone /> : <div className="rounded-2xl border border-border bg-card p-5 space-y-3"><p>Sign in to manage your account’s deletion request.</p><Button asChild><Link to="/login">Sign in</Link></Button></div>}
      <p className="text-xs text-muted-foreground">For ownership review or deletion follow-up, contact <a href="mailto:vybesocial.info@gmail.com" className="text-primary underline">vybesocial.info@gmail.com</a>. No confirmation email is sent by the request controls.</p>
      <p className="text-xs text-muted-foreground"><Link to="/privacy" className="text-primary">Privacy Policy</Link> · <Link to="/terms" className="text-primary">Terms of Service</Link></p>
    </div>
  </main>;
}
