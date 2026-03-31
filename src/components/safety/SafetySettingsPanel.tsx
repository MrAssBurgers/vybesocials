import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  MessageCircle, 
  Bell, 
  Moon, 
  Eye, 
  AlertTriangle,
  Clock,
  X,
  Plus,
  Coffee
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  useSafetySettings, 
  useUpdateSafetySettings,
  canAccessMinimalFiltering 
} from '@/hooks/useSafetySettings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const SafetySettingsPanel = memo(function SafetySettingsPanel() {
  const { profile } = useAuth();
  const { data: settings, isLoading } = useSafetySettings();
  const updateSettings = useUpdateSafetySettings();
  const [newKeyword, setNewKeyword] = useState('');
  const [canUseMinimal, setCanUseMinimal] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    supabase.rpc('get_own_sensitive_profile').single().then(({ data }) => {
      if (data?.date_of_birth) {
        setCanUseMinimal(canAccessMinimalFiltering(data.date_of_birth));
      }
    });
  }, [profile?.id]);

  const handleUpdate = async (updates: Parameters<typeof updateSettings.mutateAsync>[0]) => {
    triggerHaptic('light');
    try {
      await updateSettings.mutateAsync(updates);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !settings) return;
    
    const keywords = [...(settings.muted_keywords || []), newKeyword.trim().toLowerCase()];
    handleUpdate({ muted_keywords: keywords });
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    if (!settings) return;
    const keywords = (settings.muted_keywords || []).filter(k => k !== keyword);
    handleUpdate({ muted_keywords: keywords });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Content Filtering */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Content Filtering
          </CardTitle>
          <CardDescription>
            Control what type of content you see
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Filter Level</Label>
            <Select
              value={settings?.content_filter_level || 'moderate'}
              onValueChange={(value: 'protected' | 'moderate' | 'minimal') => {
                if (value === 'minimal' && !canUseMinimal) {
                  toast.error('Minimal filtering is only available for 18+');
                  return;
                }
                handleUpdate({ content_filter_level: value });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="protected">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    <span>Fully Protected</span>
                  </div>
                </SelectItem>
                <SelectItem value="moderate">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-amber-500" />
                    <span>Moderate</span>
                  </div>
                </SelectItem>
                <SelectItem value="minimal" disabled={!canUseMinimal}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span>Minimal (18+ only)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {settings?.content_filter_level === 'protected' && 
                'AI scans all media, blocks mature content and profanity'}
              {settings?.content_filter_level === 'moderate' && 
                'AI scans media, shows warnings for sensitive content'}
              {settings?.content_filter_level === 'minimal' && 
                'Baseline safety checks only'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DM Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Direct Messages
          </CardTitle>
          <CardDescription>
            Control who can message you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Who can DM you?</Label>
            <Select
              value={settings?.dm_filter || 'friends_only'}
              onValueChange={(value: 'everyone' | 'friends_only' | 'nobody') => 
                handleUpdate({ dm_filter: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="friends_only">Friends Only</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Message Requests</Label>
              <p className="text-xs text-muted-foreground">
                Allow non-friends to send message requests
              </p>
            </div>
            <Switch
              checked={settings?.message_requests_enabled ?? true}
              onCheckedChange={(checked) => 
                handleUpdate({ message_requests_enabled: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-primary" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Mute notifications during specific times
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Quiet Hours</Label>
            <Switch
              checked={settings?.quiet_hours_enabled ?? false}
              onCheckedChange={(checked) => 
                handleUpdate({ quiet_hours_enabled: checked })
              }
            />
          </div>

          <AnimatePresence>
            {settings?.quiet_hours_enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={settings.quiet_hours_start || '22:00'}
                    onChange={(e) => 
                      handleUpdate({ quiet_hours_start: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={settings.quiet_hours_end || '08:00'}
                    onChange={(e) => 
                      handleUpdate({ quiet_hours_end: e.target.value })
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Keyword Muting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Muted Keywords
          </CardTitle>
          <CardDescription>
            Hide posts and messages containing these words
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            />
            <Button variant="outline" size="icon" onClick={addKeyword}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {settings?.muted_keywords && settings.muted_keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.muted_keywords.map((keyword) => (
                <Badge 
                  key={keyword} 
                  variant="secondary"
                  className="pl-3 pr-1 py-1"
                >
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 hover:bg-background/50 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Take a Break */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" />
            Take a Break
          </CardTitle>
          <CardDescription>
            Get reminded to take breaks from the app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Break Reminders</Label>
              <p className="text-xs text-muted-foreground">
                Gentle nudges to step away
              </p>
            </div>
            <Switch
              checked={settings?.take_a_break_reminder ?? true}
              onCheckedChange={(checked) => 
                handleUpdate({ take_a_break_reminder: checked })
              }
            />
          </div>

          <AnimatePresence>
            {settings?.take_a_break_reminder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Remind me every
                </Label>
                <Select
                  value={String(settings.break_reminder_interval_hours || 2)}
                  onValueChange={(value) => 
                    handleUpdate({ break_reminder_interval_hours: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="3">3 hours</SelectItem>
                    <SelectItem value="4">4 hours</SelectItem>
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Global Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Global Events
          </CardTitle>
          <CardDescription>
            Control global event visibility
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Global Events</Label>
              <p className="text-xs text-muted-foreground">
                See app-wide events on your home feed
              </p>
            </div>
            <Switch
              checked={settings?.show_global_events ?? true}
              onCheckedChange={(checked) => 
                handleUpdate({ show_global_events: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
