import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, TestTube, Check, X, Loader2, Music, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MusicProvider {
  provider_id: string;
  provider_name: string;
  api_base_url: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminMusicSettings() {
  const [providers, setProviders] = useState<MusicProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

  // Add provider form state
  const [newProvider, setNewProvider] = useState({
    provider_name: '',
    api_base_url: '',
    api_key: ''
  });

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      // Note: api_key is intentionally NOT selected — it is write-only from the client.
      const { data, error } = await supabase
        .from('music_providers')
        .select('provider_id, provider_name, api_base_url, is_active, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProviders((data as MusicProvider[]) || []);
    } catch (error) {
      console.error('Error loading providers:', error);
      toast.error('Failed to load music providers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data, error } = await supabase
        .from('music_providers')
        .insert([{
          provider_name: newProvider.provider_name,
          api_base_url: newProvider.api_base_url,
          api_key: newProvider.api_key,
          is_active: false
        }])
        .select('provider_id, provider_name, api_base_url, is_active, created_at')
        .single();

      if (error) throw error;

      setProviders(prev => [data as MusicProvider, ...prev]);
      setNewProvider({ provider_name: '', api_base_url: '', api_key: '' });
      setAddDialogOpen(false);
      toast.success('Provider added successfully');
    } catch (error) {
      console.error('Error adding provider:', error);
      toast.error('Failed to add provider');
    }
  };

  const testConnection = async (provider: MusicProvider) => {
    setTestingProvider(provider.provider_id);
    
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-music-provider`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            api_base_url: provider.api_base_url,
            api_key: provider.api_key,
          }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Connection successful! Found ${result.tracks_found} tracks`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
        console.error('Test details:', result.details);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Failed to test connection');
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleProvider = async (provider: MusicProvider) => {
    try {
      const { error } = await supabase
        .from('music_providers')
        .update({ is_active: !provider.is_active })
        .eq('provider_id', provider.provider_id);

      if (error) throw error;

      setProviders(prev => 
        prev.map(p => 
          p.provider_id === provider.provider_id 
            ? { ...p, is_active: !p.is_active }
            : p
        )
      );

      toast.success(`Provider ${!provider.is_active ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling provider:', error);
      toast.error('Failed to update provider');
    }
  };

  const syncProvider = async (provider: MusicProvider) => {
    setSyncingProvider(provider.provider_id);
    
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-music-providers`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider_id: provider.provider_id,
          }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Synced ${result.synced_count} tracks from ${result.provider}`);
      } else {
        toast.error(`Sync failed: ${result.error}`);
        console.error('Sync details:', result.details);
      }
    } catch (error) {
      console.error('Error syncing provider:', error);
      toast.error('Failed to sync provider');
    } finally {
      setSyncingProvider(null);
    }
  };

  const deleteProvider = async (providerId: string) => {
    try {
      const { error } = await supabase
        .from('music_providers')
        .delete()
        .eq('provider_id', providerId);

      if (error) throw error;

      setProviders(prev => prev.filter(p => p.provider_id !== providerId));
      toast.success('Provider deleted successfully');
    } catch (error) {
      console.error('Error deleting provider:', error);
      toast.error('Failed to delete provider');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Music Provider Settings</h1>
            <p className="text-muted-foreground mt-2">
              Manage third-party music providers for the VYBE music gallery
            </p>
          </div>
          
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddProvider}>
                <DialogHeader>
                  <DialogTitle>Add Music Provider</DialogTitle>
                  <DialogDescription>
                    Connect a new music API provider to expand your music catalog
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider_name">Provider Name</Label>
                    <Input
                      id="provider_name"
                      value={newProvider.provider_name}
                      onChange={(e) => setNewProvider(prev => ({
                        ...prev,
                        provider_name: e.target.value
                      }))}
                      placeholder="e.g., Epidemic Sound, Soundstripe"
                      required
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="api_base_url">API Base URL</Label>
                    <Input
                      id="api_base_url"
                      value={newProvider.api_base_url}
                      onChange={(e) => setNewProvider(prev => ({
                        ...prev,
                        api_base_url: e.target.value
                      }))}
                      placeholder="https://api.provider.com/v1"
                      type="url"
                      required
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="api_key">API Key</Label>
                    <Input
                      id="api_key"
                      value={newProvider.api_key}
                      onChange={(e) => setNewProvider(prev => ({
                        ...prev,
                        api_key: e.target.value
                      }))}
                      placeholder="Your provider API key"
                      type="password"
                      required
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Add Provider</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6">
          {providers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Music className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Music Providers</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Get started by adding your first music API provider
                </p>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            providers.map((provider) => (
              <Card key={provider.provider_id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {provider.provider_name}
                        <Badge variant={provider.is_active ? 'default' : 'secondary'}>
                          {provider.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {provider.api_base_url}
                      </CardDescription>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={() => toggleProvider(provider)}
                      />
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(provider)}
                      disabled={testingProvider === provider.provider_id}
                    >
                      {testingProvider === provider.provider_id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncProvider(provider)}
                      disabled={!provider.is_active || syncingProvider === provider.provider_id}
                    >
                      {syncingProvider === provider.provider_id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Music className="h-4 w-4 mr-2" />
                      )}
                      Sync Music
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Provider</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{provider.provider_name}"? 
                            This will also remove all associated tracks from the music gallery.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteProvider(provider.provider_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}