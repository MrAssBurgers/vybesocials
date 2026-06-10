import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, Ruler, UtensilsCrossed, Music, Tv, Headphones,
  Save, Eye, EyeOff, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { useAuth } from '@/lib/auth';
import { useUserAbout, useUpdateUserAbout, UserAboutInput } from '@/hooks/useUserAbout';
import { cn } from '@/lib/utils';

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

const GENRE_OPTIONS = [
  'Hip Hop', 'R&B', 'Pop', 'Rock', 'Jazz', 'Classical',
  'EDM', 'Country', 'Latin', 'K-Pop', 'Indie', 'Metal',
  'Soul', 'Reggae', 'Lo-fi', 'Punk',
];

export function AboutMeSection() {
  const { profile } = useAuth();
  const { data: about } = useUserAbout(profile?.id);
  const updateAbout = useUpdateUserAbout();

  const [form, setForm] = useState<UserAboutInput>({
    mbti: null,
    height: null,
    favorite_food: null,
    music_genres: [],
    streaming_services: [],
    now_listening_title: null,
    now_listening_artist: null,
    now_listening_cover_url: null,
    now_listening_service: null,
    now_watching_title: null,
    now_watching_service: null,
    now_watching_cover_url: null,
    show_age: false,
  });

  const [mbtiOpen, setMbtiOpen] = useState(false);

  useEffect(() => {
    if (about) {
      setForm({
        mbti: about.mbti,
        height: about.height,
        favorite_food: about.favorite_food,
        music_genres: about.music_genres || [],
        streaming_services: about.streaming_services || [],
        now_listening_title: about.now_listening_title,
        now_listening_artist: about.now_listening_artist,
        now_listening_cover_url: about.now_listening_cover_url,
        now_listening_service: about.now_listening_service,
        now_watching_title: about.now_watching_title,
        now_watching_service: about.now_watching_service,
        now_watching_cover_url: about.now_watching_cover_url,
        show_age: about.show_age,
      });
    }
  }, [about]);

  const toggleGenre = (genre: string) => {
    const current = form.music_genres || [];
    setForm({
      ...form,
      music_genres: current.includes(genre)
        ? current.filter((g) => g !== genre)
        : [...current, genre],
    });
  };

  const handleSave = async () => {
    haptics.select();
    try {
      await updateAbout.mutateAsync(form);
      haptics.success();
      toast.success('About details saved!');
    } catch (e: any) {
      haptics.error();
      toast.error(e.message || 'Failed to save');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="liquid-glass-card p-4 sm:p-6 space-y-5"
    >
      <h3 className="font-semibold text-base text-foreground">
        About You
      </h3>

      {/* Show Age Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm flex items-center gap-2">
          {form.show_age ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
          Show age on profile
        </Label>
        <Switch
          checked={form.show_age || false}
          onCheckedChange={(v) => setForm({ ...form, show_age: v })}
        />
      </div>

      {/* MBTI Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Brain className="w-4 h-4 text-muted-foreground" />
          MBTI Personality
        </Label>
        <button
          type="button"
          onClick={() => setMbtiOpen(!mbtiOpen)}
          className="w-full h-11 px-4 rounded-xl liquid-glass-input flex items-center justify-between text-sm"
        >
          <span className={form.mbti ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            {form.mbti || 'Select your type'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', mbtiOpen && 'rotate-180')} />
        </button>
        {mbtiOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="grid grid-cols-4 gap-1.5 pt-1"
          >
            {MBTI_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setForm({ ...form, mbti: form.mbti === type ? null : type });
                  setMbtiOpen(false);
                }}
                className={cn(
                  'py-2 rounded-lg text-xs font-bold transition-all',
                  form.mbti === type
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                )}
              >
                {type}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Height */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Ruler className="w-4 h-4 text-muted-foreground" />
          Height
        </Label>
        <Input
          placeholder={`5'11" or 180cm`}
          value={form.height || ''}
          onChange={(e) => setForm({ ...form, height: e.target.value || null })}
          className="h-11"
          maxLength={10}
        />
      </div>

      {/* Favorite Food */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
          Favorite Food
        </Label>
        <Input
          placeholder="Pizza, sushi, tacos..."
          value={form.favorite_food || ''}
          onChange={(e) => setForm({ ...form, favorite_food: e.target.value || null })}
          className="h-11"
          maxLength={50}
        />
      </div>

      {/* Music Genres */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Music className="w-4 h-4 text-muted-foreground" />
          Music Genres
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {GENRE_OPTIONS.map((genre) => {
            const selected = form.music_genres?.includes(genre);
            return (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                )}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Now Listening */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Headphones className="w-4 h-4 text-muted-foreground" />
          Now Listening
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Song title"
            value={form.now_listening_title || ''}
            onChange={(e) => setForm({ ...form, now_listening_title: e.target.value || null })}
            className="h-10 text-sm"
            maxLength={100}
          />
          <Input
            placeholder="Artist"
            value={form.now_listening_artist || ''}
            onChange={(e) => setForm({ ...form, now_listening_artist: e.target.value || null })}
            className="h-10 text-sm"
            maxLength={100}
          />
        </div>
        <Input
          placeholder="Album art URL (optional)"
          value={form.now_listening_cover_url || ''}
          onChange={(e) => setForm({ ...form, now_listening_cover_url: e.target.value || null })}
          className="h-10 text-sm"
          maxLength={500}
        />
        <div className="flex gap-2">
          {['spotify', 'apple_music'].map((svc) => (
            <button
              key={svc}
              onClick={() => setForm({ ...form, now_listening_service: form.now_listening_service === svc ? null : svc })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
                form.now_listening_service === svc
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground'
              )}
            >
              {svc.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Now Watching */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Tv className="w-4 h-4 text-muted-foreground" />
          Now Watching
        </Label>
        <Input
          placeholder="Show or movie title"
          value={form.now_watching_title || ''}
          onChange={(e) => setForm({ ...form, now_watching_title: e.target.value || null })}
          className="h-10 text-sm"
          maxLength={100}
        />
        <div className="flex gap-2">
          <Input
            placeholder="Service (Netflix, Hulu...)"
            value={form.now_watching_service || ''}
            onChange={(e) => setForm({ ...form, now_watching_service: e.target.value || null })}
            className="h-10 text-sm flex-1"
            maxLength={30}
          />
          <Input
            placeholder="Cover URL (optional)"
            value={form.now_watching_cover_url || ''}
            onChange={(e) => setForm({ ...form, now_watching_cover_url: e.target.value || null })}
            className="h-10 text-sm flex-1"
            maxLength={500}
          />
        </div>
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={updateAbout.isPending}
        className="w-full h-11 gap-2"
      >
        <Save className="w-4 h-4" />
        {updateAbout.isPending ? 'Saving...' : 'Save About Details'}
      </Button>
    </motion.div>
  );
}
