import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Code2, 
  Bug, 
  Layers, 
  Zap, 
  RefreshCw,
  ChevronRight,
  Lock,
  Sparkles,
  Terminal,
  Crown,
  Trash2,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getFeatureFlags, setFeatureFlag, resetFeatureFlags, FeatureFlags } from '@/lib/featureFlags';
import { getEventLog, clearEventLog } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function DeveloperSection() {
  const [flags, setFlags] = useState<FeatureFlags>(getFeatureFlags());
  const [showAnalytics, setShowAnalytics] = useState(false);
  const debugPanel = useDebugPanel();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: isOwner } = useQuery({
    queryKey: ['is-owner', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return false;
      const { data } = await supabase.rpc('is_owner', { _user_id: profile.user_id });
      return !!data;
    },
    enabled: !!profile?.user_id,
    staleTime: 60_000,
  });

  const handleFlagChange = (flag: keyof FeatureFlags, value: boolean) => {
    haptics.tap();
    setFeatureFlag(flag, value);
    setFlags(getFeatureFlags());
    toast.success(`${flag} ${value ? 'enabled' : 'disabled'}`);
  };

  const handleReset = () => {
    haptics.tap();
    resetFeatureFlags();
    setFlags(getFeatureFlags());
    toast.success('Feature flags reset to defaults');
  };

  const handleCloseDevTools = () => {
    haptics.impact();
    if (debugPanel) {
      debugPanel.setIsOpen(false);
    }
    toast.success('DevTools panel closed. Use Cmd+Shift+D or 7-tap logo to reopen.');
  };

  const eventLog = getEventLog();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Owner Command Center Link */}
      {isOwner && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass-card p-3 sm:p-6"
        >
          <Button
            variant="outline"
            className="w-full justify-between h-12 sm:h-14"
            onClick={() => {
              haptics.tap();
              navigate('/admin/settings');
            }}
          >
            <span className="flex items-center gap-2.5">
              <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="text-sm sm:text-base font-medium">Owner Command Center</span>
            </span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isOwner ? 0.1 : 0 }}
        className="liquid-glass-card p-3 sm:p-6"
      >
        <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Code2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base mb-0.5 sm:mb-1">Developer Options</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Advanced settings for testing and debugging
            </p>
          </div>
        </div>

        {/* Open DevTools Panel */}
        {debugPanel?.isAdmin && (
          <div className="space-y-2 mb-4 sm:mb-6">
            <Button
              variant="outline"
              className="w-full justify-between h-10 sm:h-12 text-xs sm:text-sm"
              onClick={() => {
                haptics.tap();
                debugPanel.setIsOpen(true);
              }}
            >
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Open Production DevTools
              </span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-10 sm:h-12 text-xs sm:text-sm border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleCloseDevTools}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Close DevTools Panel
              </span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>
        )}

        {/* Feature Flags */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-xs sm:text-sm flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
              Feature Flags
            </h4>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7 sm:h-8">
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {/* Debug Panel */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Bug className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium">Debug Panel</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Show debug info overlay</p>
                </div>
              </div>
              <Switch
                checked={flags.debug_panel_enabled}
                onCheckedChange={(v) => handleFlagChange('debug_panel_enabled', v)}
              />
            </div>

            {/* AI Features */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium">AI Smart Replies</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">AI-suggested message responses</p>
                </div>
              </div>
              <Switch
                checked={flags.ai_smart_replies}
                onCheckedChange={(v) => handleFlagChange('ai_smart_replies', v)}
              />
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium">Analytics</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Track app usage events</p>
                </div>
              </div>
              <Switch
                checked={flags.analytics_enabled}
                onCheckedChange={(v) => handleFlagChange('analytics_enabled', v)}
              />
            </div>

            {/* Minis - Always disabled, coming soon */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/30 opacity-60">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
                    VYBE Minis
                    <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5">Coming Soon</Badge>
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Mini apps platform</p>
                </div>
              </div>
              <Switch disabled checked={false} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Analytics Log */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isOwner ? 0.2 : 0.1 }}
        className="liquid-glass-card p-3 sm:p-6"
      >
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium text-sm">Analytics Log</p>
              <p className="text-xs text-muted-foreground">
                {eventLog.length} events recorded
              </p>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 transition-transform ${showAnalytics ? 'rotate-90' : ''}`} />
        </button>

        {showAnalytics && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-4 space-y-2"
          >
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearEventLog();
                  toast.success('Event log cleared');
                }}
              >
                Clear Log
              </Button>
            </div>
            
            {eventLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No events recorded yet
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {eventLog.slice().reverse().map((event, i) => (
                  <div
                    key={i}
                    className="text-xs p-2 rounded bg-muted/30 font-mono"
                  >
                    <span className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>{' '}
                    <span className="text-primary">{event.name}</span>
                    {event.data && (
                      <span className="text-muted-foreground">
                        {' '}
                        {JSON.stringify(event.data)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
