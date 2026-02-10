import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { StripeSettingsSection } from '@/components/admin/settings/StripeSettingsSection';
import { Settings, CreditCard, Loader2, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function useIsOwner() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['is-owner', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return false;
      const { data } = await supabase.rpc('is_owner', { _user_id: profile.user_id });
      return !!data;
    },
    enabled: !!profile?.user_id,
    staleTime: 60_000,
  });
}

export default function AdminSettings() {
  const { data: isOwner, isLoading: roleLoading } = useIsOwner();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roleLoading && !isOwner) {
      navigate('/home');
    }
  }, [roleLoading, isOwner, navigate]);

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isOwner) {
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
