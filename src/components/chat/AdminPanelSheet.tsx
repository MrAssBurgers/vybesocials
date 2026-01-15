import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Ban, Laugh, Shield, Clock, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWarnUser, useBanUser } from '@/hooks/useModerationActions';
import { toast } from 'sonner';
import { MemeBanGifPicker } from '@/components/moderation/MemeBanGifPicker';

interface AdminPanelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
}

type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
type ActionType = 'warn' | 'ban' | 'meme-ban' | null;

const timeUnitMultipliers: Record<TimeUnit, number> = {
  minutes: 1 / (24 * 60),
  hours: 1 / 24,
  days: 1,
  weeks: 7,
  months: 30,
};

export function AdminPanelSheet({ open, onOpenChange, userId, username }: AdminPanelSheetProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [reason, setReason] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [banAmount, setBanAmount] = useState(1);
  const [banUnit, setBanUnit] = useState<TimeUnit>('hours');
  const [customGifUrl, setCustomGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);

  const warnUser = useWarnUser();
  const banUser = useBanUser();

  const calculateDays = (amount: number, unit: TimeUnit): number => {
    return amount * timeUnitMultipliers[unit];
  };

  const handleWarn = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      await warnUser.mutateAsync({ userId, reason });
      toast.success(`Warned @${username}`);
      resetAndClose();
    } catch (error) {
      toast.error('Failed to warn user');
    }
  };

  const handleBan = async (isMemeBan: boolean) => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      const durationDays = isPermanent ? undefined : calculateDays(banAmount, banUnit);
      await banUser.mutateAsync({
        userId,
        reason,
        isPermanent,
        durationDays,
        isMemeBan,
        customGifUrl: isMemeBan ? customGifUrl : null,
      });
      toast.success(`${isMemeBan ? 'Meme banned' : 'Banned'} @${username}`);
      resetAndClose();
    } catch (error) {
      toast.error('Failed to ban user');
    }
  };

  const resetAndClose = () => {
    setActiveAction(null);
    setReason('');
    setIsPermanent(false);
    setBanAmount(1);
    setBanUnit('hours');
    setCustomGifUrl(null);
    setShowGifPicker(false);
    onOpenChange(false);
  };

  const actionButtons = [
    {
      type: 'warn' as ActionType,
      icon: AlertTriangle,
      label: 'Warn User',
      description: 'Send a warning notification',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30',
    },
    {
      type: 'ban' as ActionType,
      icon: Ban,
      label: 'Ban User',
      description: 'Restrict platform access',
      color: 'text-destructive',
      bg: 'bg-destructive/10 hover:bg-destructive/20 border-destructive/30',
    },
    {
      type: 'meme-ban' as ActionType,
      icon: Laugh,
      label: 'Meme Ban 😂',
      description: 'The funny ban screen',
      color: 'text-orange-500',
      bg: 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            Admin Panel
          </SheetTitle>
          <SheetDescription>
            Moderate @{username}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
          {!activeAction ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {actionButtons.map(({ type, icon: Icon, label, description, color, bg }) => (
                <motion.button
                  key={type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveAction(type)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${bg}`}
                >
                  <div className={`p-3 rounded-lg bg-background ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveAction(null)}
                className="mb-2"
              >
                <X className="h-4 w-4 mr-2" />
                Back
              </Button>

              {activeAction === 'warn' && (
                <div className="space-y-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-center gap-2 text-yellow-500">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-semibold">Warn @{username}</span>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea
                      placeholder="Explain why you're warning this user..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <Button
                    onClick={handleWarn}
                    disabled={warnUser.isPending}
                    className="w-full bg-yellow-600 hover:bg-yellow-700"
                  >
                    {warnUser.isPending ? 'Sending...' : 'Send Warning'}
                  </Button>
                </div>
              )}

              {(activeAction === 'ban' || activeAction === 'meme-ban') && (
                <div className={`space-y-4 p-4 rounded-xl border ${
                  activeAction === 'meme-ban' 
                    ? 'bg-orange-500/10 border-orange-500/30' 
                    : 'bg-destructive/10 border-destructive/30'
                }`}>
                  <div className={`flex items-center gap-2 ${
                    activeAction === 'meme-ban' ? 'text-orange-500' : 'text-destructive'
                  }`}>
                    {activeAction === 'meme-ban' ? (
                      <Laugh className="h-5 w-5" />
                    ) : (
                      <Ban className="h-5 w-5" />
                    )}
                    <span className="font-semibold">
                      {activeAction === 'meme-ban' ? 'Meme Ban' : 'Ban'} @{username}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea
                      placeholder={activeAction === 'meme-ban' ? 'Get rekt noob...' : 'Explain why you\'re banning this user...'}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                    <Label>Permanent</Label>
                    <Switch checked={isPermanent} onCheckedChange={setIsPermanent} />
                  </div>

                  {!isPermanent && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Duration
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={999}
                          value={banAmount}
                          onChange={(e) => setBanAmount(parseInt(e.target.value) || 1)}
                          className="w-24 bg-background"
                        />
                        <Select value={banUnit} onValueChange={(v) => setBanUnit(v as TimeUnit)}>
                          <SelectTrigger className="flex-1 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                            <SelectItem value="months">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Meme GIF Selector - only for meme ban */}
                  {activeAction === 'meme-ban' && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowGifPicker(!showGifPicker)}
                        className="w-full border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        {customGifUrl ? 'Change Meme Background' : 'Select Meme Background'}
                      </Button>
                      
                      {showGifPicker && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <MemeBanGifPicker
                            selectedGifUrl={customGifUrl}
                            onSelectGif={(url) => {
                              setCustomGifUrl(url);
                              if (url) setShowGifPicker(false);
                            }}
                          />
                        </motion.div>
                      )}
                      
                      {customGifUrl && !showGifPicker && (
                        <div className="relative rounded-lg overflow-hidden border border-orange-500/30 bg-black">
                          <img
                            src={customGifUrl}
                            alt="Selected meme"
                            className="w-full h-24 object-cover"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/70 text-xs px-2 py-0.5 rounded text-orange-400">
                            Selected
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={() => handleBan(activeAction === 'meme-ban')}
                    disabled={banUser.isPending}
                    className={`w-full ${
                      activeAction === 'meme-ban'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-destructive hover:bg-destructive/90'
                    }`}
                  >
                    {banUser.isPending ? 'Banning...' : activeAction === 'meme-ban' ? '😂 Meme Ban!' : 'Ban User'}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
