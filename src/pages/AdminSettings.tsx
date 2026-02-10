import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUserRole } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { StripeSettingsSection } from '@/components/admin/settings/StripeSettingsSection';
import { Settings, CreditCard, Loader2, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AdminSettings() {
  const { profile } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/home');
    }
  }, [roleLoading, isAdmin, navigate]);

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <ShieldAlert className="h-12 w-12 text-destructive" />
          <p className="text-muted-foreground">Access denied</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Owner Settings</h1>
            <p className="text-sm text-muted-foreground">Platform configuration</p>
          </div>
        </div>

        <Tabs defaultValue="payments" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Payments
            </TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="mt-4">
            <StripeSettingsSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
