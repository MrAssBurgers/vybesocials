import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Plus, Loader2, Check, MapPin, Sparkles } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface AIBriefCustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreferencesUpdated: () => void;
}

interface Preferences {
  custom_topics: string[];
  excluded_topics: string[];
  show_images: boolean;
  brief_style: string;
}

const TOPIC_CATEGORIES = [
  {
    label: 'News & World',
    topics: ['Breaking News', 'Politics', 'Climate', 'Science', 'Space'],
  },
  {
    label: 'Tech & Business',
    topics: ['Technology', 'AI News', 'Stock Market', 'Crypto', 'Business', 'Tech Reviews'],
  },
  {
    label: 'Entertainment',
    topics: ['Pop Culture', 'Movies', 'Movie Reviews', 'Music', 'Music Releases', 'Gaming', 'Gaming News', 'Comedy'],
  },
  {
    label: 'Lifestyle',
    topics: ['Fitness', 'Workout Tips', 'Recipes', 'Cooking', 'Fashion', 'Travel', 'Travel Deals', 'Health'],
  },
  {
    label: 'Creative',
    topics: ['Art', 'Photography', 'DIY', 'Reading'],
  },
  {
    label: 'Sports & Nature',
    topics: ['Sports', 'Sports Scores', 'Nature', 'Animals'],
  },
];

export function AIBriefCustomizeSheet({ open, onOpenChange, onPreferencesUpdated }: AIBriefCustomizeSheetProps) {
  const { user, profile } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>({
    custom_topics: [],
    excluded_topics: [],
    show_images: true,
    brief_style: 'detailed'
  });
  const [newTopic, setNewTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(() => localStorage.getItem('vybe_ai_location') === 'true');

  useEffect(() => {
    if (open && profile?.id) loadPreferences();
  }, [open, profile?.id]);

  const loadPreferences = async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('ai_brief_preferences')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      if (data) {
        setPreferences({
          custom_topics: data.custom_topics || [],
          excluded_topics: data.excluded_topics || [],
          show_images: data.show_images ?? true,
          brief_style: data.brief_style || 'detailed'
        });
      }
    } catch {}
    setIsLoading(false);
  };

  const savePreferences = async () => {
    if (!profile?.id) { toast.error('Please sign in'); return; }
    setIsSaving(true);
    haptics.tap();

    try {
      const { error } = await supabase
        .from('ai_brief_preferences')
        .upsert({
          user_id: profile.id,
          custom_topics: preferences.custom_topics,
          excluded_topics: preferences.excluded_topics,
          show_images: preferences.show_images,
          brief_style: preferences.brief_style,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        toast.error('Could not save. Try again.');
        return;
      }

      // Save location preference
      localStorage.setItem('vybe_ai_location', locationEnabled ? 'true' : 'false');

      toast.success('Preferences saved!');
      haptics.success();
      onPreferencesUpdated();
      onOpenChange(false);
    } catch {
      toast.error('Could not save. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTopic = (topic: string) => {
    const lower = topic.toLowerCase();
    const exists = preferences.custom_topics.some(t => t.toLowerCase() === lower);
    setPreferences(prev => ({
      ...prev,
      custom_topics: exists
        ? prev.custom_topics.filter(t => t.toLowerCase() !== lower)
        : [...prev.custom_topics, topic]
    }));
    haptics.tap();
  };

  const addCustomTopic = () => {
    const trimmed = newTopic.trim();
    if (!trimmed) return;
    if (preferences.custom_topics.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      toast.info('Already added');
      return;
    }
    setPreferences(prev => ({ ...prev, custom_topics: [...prev.custom_topics, trimmed] }));
    setNewTopic('');
    haptics.tap();
  };

  const isSelected = (topic: string) => preferences.custom_topics.some(t => t.toLowerCase() === topic.toLowerCase());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] rounded-t-3xl flex flex-col overflow-hidden bg-background"
        hideCloseButton
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/15" />
        </div>

        <SheetHeader className="flex-shrink-0 pb-3 px-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <VybeMiniIcon size={18} showSparkles />
            Customize Brief
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">Pick topics you care about. We'll find the latest for you.</p>
        </SheetHeader>

        <div 
          className="flex-1 overflow-y-auto overscroll-contain py-3 space-y-5"
          style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Custom topic input */}
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Add your own</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g., Electric vehicles, NBA..."
                    className="flex-1 h-9 text-sm rounded-xl"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomTopic()}
                  />
                  <Button size="icon" className="h-9 w-9 rounded-xl" onClick={addCustomTopic} disabled={!newTopic.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Custom topics added by user */}
                {preferences.custom_topics.filter(t => !TOPIC_CATEGORIES.some(cat => cat.topics.some(ct => ct.toLowerCase() === t.toLowerCase()))).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {preferences.custom_topics
                      .filter(t => !TOPIC_CATEGORIES.some(cat => cat.topics.some(ct => ct.toLowerCase() === t.toLowerCase())))
                      .map(topic => (
                        <button
                          key={topic}
                          onClick={() => toggleTopic(topic)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/15 text-primary border border-primary/20"
                        >
                          {topic}
                          <X className="h-3 w-3 opacity-60" />
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Categorized topics */}
              {TOPIC_CATEGORIES.map((category) => (
                <div key={category.label} className="space-y-2">
                  <Label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">{category.label}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {category.topics.map((topic) => {
                      const selected = isSelected(topic);
                      return (
                        <button
                          key={topic}
                          onClick={() => toggleTopic(topic)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-150",
                            selected
                              ? "bg-primary/15 text-primary border border-primary/25"
                              : "bg-muted/30 text-muted-foreground border border-border/15 hover:border-border/30"
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                          {topic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Settings */}
              <div className="space-y-3.5 pt-3 border-t border-border/10">
                <Label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Settings</Label>
                
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Location news</Label>
                    <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Get local updates near you
                    </p>
                  </div>
                  <Switch
                    checked={locationEnabled}
                    onCheckedChange={(checked) => {
                      setLocationEnabled(checked);
                      if (checked && navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(() => {}, () => {
                          toast.error('Location access denied');
                          setLocationEnabled(false);
                        });
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Show images</Label>
                    <p className="text-[10px] text-muted-foreground/60">Display images with updates</p>
                  </div>
                  <Switch
                    checked={preferences.show_images}
                    onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, show_images: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Brief style</Label>
                    <p className="text-[10px] text-muted-foreground/60">How detailed updates should be</p>
                  </div>
                  <div className="flex gap-1.5">
                    {(['concise', 'detailed'] as const).map(style => (
                      <button
                        key={style}
                        onClick={() => setPreferences(prev => ({ ...prev, brief_style: style }))}
                        className={cn(
                          "px-3 py-1 rounded-lg text-[11px] font-medium transition-all capitalize",
                          preferences.brief_style === style
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Save */}
        <div className="flex-shrink-0 pt-3 pb-2 border-t border-border/10">
          <Button onClick={savePreferences} className="w-full gap-2 h-11 rounded-xl" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save & Refresh'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
