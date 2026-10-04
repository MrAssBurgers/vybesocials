import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, Plus, Edit2, Trash2, Award, Search, Users, 
  Save, X, Loader2, UserMinus
} from 'lucide-react';
import { useAllBadges, useAwardBadge, useRemoveBadge, Badge } from '@/hooks/useBadges';
import { db, getFirebaseAuth } from '@/lib/firebase';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BadgeIcon } from '@/components/badges/BadgeIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { toast } from 'sonner';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';

const CATEGORY_OPTIONS = [
  { value: 'role', label: 'Role (Staff)' },
  { value: 'patreon', label: 'Patreon' },
  { value: 'referral', label: 'Referral' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'beta', label: 'Beta' },
  { value: 'special', label: 'Special' },
];

const EFFECT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'glow', label: 'Glow' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'shine', label: 'Shine' },
];

interface BadgeFormData {
  name: string;
  description: string;
  icon: string;
  category: string;
  priority: number;
  gradient_from: string;
  gradient_to: string;
  gradient_via: string;
  effect: string;
  is_animated: boolean;
  is_staff_badge: boolean;
  can_be_disabled: boolean;
}

interface UserSearchResult {
  id: string;
  user_id: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface BadgeHolder {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  profile_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const defaultFormData: BadgeFormData = {
  name: '',
  description: '',
  icon: '🏆',
  category: 'achievement',
  priority: 100,
  gradient_from: '',
  gradient_to: '',
  gradient_via: '',
  effect: 'none',
  is_animated: false,
  is_staff_badge: false,
  can_be_disabled: true,
};

export function AdminBadgeManager() {
  const { data: badges, isLoading } = useAllBadges();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [formData, setFormData] = useState<BadgeFormData>(defaultFormData);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manageUsersDialogOpen, setManageUsersDialogOpen] = useState(false);
  const [selectedBadgeForManage, setSelectedBadgeForManage] = useState<Badge | null>(null);
  const [awardUsername, setAwardUsername] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const removeBadge = useRemoveBadge();

  // Fetch badge holders when dialog opens
  const { data: badgeHolders, isLoading: holdersLoading, refetch: refetchHolders } = useQuery({
    queryKey: ['badge-holders', selectedBadgeForManage?.id],
    queryFn: async (): Promise<BadgeHolder[]> => {
      if (!selectedBadgeForManage) return [];
      
      const { data, error } = await db
        .from('user_badges')
        .select('id, user_id, badge_id, earned_at')
        .eq('badge_id', selectedBadgeForManage.id);
      
      if (error) throw error;
      if (!data || data.length === 0) return [];
      
      // Get profile info for each holder
      const userIds = data.map(h => h.user_id);
      const { data: profiles } = await db
        .from('profiles')
        .select('id, user_id, username, display_name, avatar_url')
        .or(`user_id.in.(${userIds.join(',')}),id.in.(${userIds.join(',')})`);
      
      const profileMap = new Map();
      profiles?.forEach(p => {
        profileMap.set(p.user_id, p);
        profileMap.set(p.id, p);
      });
      
      return data.map(h => {
        const profile = profileMap.get(h.user_id);
        return {
          ...h,
          profile_id: profile?.id || h.user_id,
          username: profile?.username || 'Unknown',
          display_name: profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
        };
      });
    },
    enabled: manageUsersDialogOpen && !!selectedBadgeForManage,
  });

  const handleRemoveBadge = async (holder: BadgeHolder) => {
    const staffUid = getFirebaseAuth()?.currentUser?.uid;
    if (!staffUid) return;
    if (!confirm(`Remove badge from @${holder.username}?`)) return;
    
    try {
      await removeBadge.mutateAsync({
        userId: holder.user_id,
        badgeId: holder.badge_id,
      });
      if (getFirebaseAuth()?.currentUser?.uid !== staffUid) return;
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['badge-holders', holder.badge_id] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', holder.profile_id] });
      queryClient.invalidateQueries({ queryKey: ['display-style', holder.profile_id] });
      
      toast.success(`Badge removed from @${holder.username}`);
      refetchHolders();
    } catch (err: any) {
      if (getFirebaseAuth()?.currentUser?.uid !== staffUid) return;
      toast.error(err.message);
    }
  };

  // Debounced user search
  useEffect(() => {
    if (!manageUsersDialogOpen) {
      setUserSearchResults([]);
      setSelectedUser(null);
      return;
    }
    
    const searchTerm = awardUsername.trim();
    if (searchTerm.length < 2) {
      setUserSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Search by username OR display_name (case insensitive)
        const { data, error } = await db
          .from('profiles')
          .select('id, user_id, username, display_name, avatar_url')
          .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
          .limit(10);

        if (!error && data) {
          // Filter out users who already have this badge
          const holderUserIds = badgeHolders?.map(h => h.user_id) || [];
          const filteredData = data.filter(u => !holderUserIds.includes(u.user_id || u.id));
          setUserSearchResults(filteredData);
        }
      } catch (err) {
        console.error('User search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [awardUsername, manageUsersDialogOpen, badgeHolders]);

  const awardBadge = useAwardBadge();

  const createBadge = useMutation({
    mutationFn: async (data: BadgeFormData) => {
      const { error } = await db.from('badges').insert({
        name: data.name,
        description: data.description || null,
        icon: data.icon,
        category: data.category as any,
        priority: data.priority,
        gradient_from: data.gradient_from || null,
        gradient_to: data.gradient_to || null,
        gradient_via: data.gradient_via || null,
        effect: data.effect === 'none' ? null : data.effect,
        is_animated: data.is_animated,
        is_staff_badge: data.is_staff_badge,
        can_be_disabled: data.can_be_disabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-badges'] });
      toast.success('Badge created!');
      setIsDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateBadge = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BadgeFormData }) => {
      const { error } = await db.from('badges').update({
        name: data.name,
        description: data.description || null,
        icon: data.icon,
        category: data.category as any,
        priority: data.priority,
        gradient_from: data.gradient_from || null,
        gradient_to: data.gradient_to || null,
        gradient_via: data.gradient_via || null,
        effect: data.effect === 'none' ? null : data.effect,
        is_animated: data.is_animated,
        is_staff_badge: data.is_staff_badge,
        can_be_disabled: data.can_be_disabled,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-badges'] });
      toast.success('Badge updated!');
      setIsDialogOpen(false);
      setEditingBadge(null);
      setFormData(defaultFormData);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteBadge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('badges').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-badges'] });
      toast.success('Badge deleted');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAwardBadge = async () => {
    if (!selectedBadgeForManage) return;
    const staffUid = getFirebaseAuth()?.currentUser?.uid;
    if (!staffUid) return;
    
    // Use selected user from dropdown, or search by username if typed manually
    let targetProfile = selectedUser;
    
    if (!targetProfile && awardUsername.trim()) {
      const { data, error } = await db
        .from('profiles')
        .select('id, user_id, username, display_name, avatar_url')
        .or(`username.ilike.${awardUsername.trim()},display_name.ilike.${awardUsername.trim()}`)
        .maybeSingle();
      if (getFirebaseAuth()?.currentUser?.uid !== staffUid) return;
      
      if (error || !data) {
        toast.error('User not found');
        return;
      }
      targetProfile = data;
    }
    
    if (!targetProfile) {
      toast.error('Please select a user');
      return;
    }
    
    // Use the auth user_id if available, otherwise fall back to profile id
    const targetUserId = targetProfile.user_id || targetProfile.id;
    
    try {
      await awardBadge.mutateAsync({
        userId: targetUserId,
        badgeId: selectedBadgeForManage.id,
      });
      if (getFirebaseAuth()?.currentUser?.uid !== staffUid) return;
      
      // Invalidate both the target user's badges and display style
      queryClient.invalidateQueries({ queryKey: ['user-badges', targetProfile.id] });
      queryClient.invalidateQueries({ queryKey: ['display-style', targetProfile.id] });
      queryClient.invalidateQueries({ queryKey: ['user-primary-badge', targetProfile.id] });
      queryClient.invalidateQueries({ queryKey: ['badge-holders', selectedBadgeForManage.id] });
      
      toast.success(`Badge awarded to @${targetProfile.username}`);
      setAwardUsername('');
      setSelectedUser(null);
      refetchHolders();
    } catch (err: any) {
      if (getFirebaseAuth()?.currentUser?.uid !== staffUid) return;
      toast.error(err.message);
    }
  };

  const openEditDialog = (badge: Badge) => {
    setEditingBadge(badge);
    setFormData({
      name: badge.name,
      description: badge.description || '',
      icon: badge.icon,
      category: badge.category,
      priority: badge.priority,
      gradient_from: badge.gradient_from || '',
      gradient_to: badge.gradient_to || '',
      gradient_via: badge.gradient_via || '',
      effect: badge.effect || 'none',
      is_animated: badge.is_animated,
      is_staff_badge: badge.is_staff_badge,
      can_be_disabled: badge.can_be_disabled,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingBadge(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.icon) {
      toast.error('Name and icon are required');
      return;
    }
    
    if (editingBadge) {
      updateBadge.mutate({ id: editingBadge.id, data: formData });
    } else {
      createBadge.mutate(formData);
    }
  };

  const filteredBadges = badges?.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Badge Management</h2>
            <p className="text-sm text-muted-foreground">Create and manage badges</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Badge
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search badges..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Badge List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredBadges.map((badge) => (
          <GlassCard key={badge.id} className="p-4">
            <div className="flex items-center gap-4">
              <BadgeIcon
                icon={badge.icon}
                name={badge.name}
                gradient_from={badge.gradient_from}
                gradient_to={badge.gradient_to}
                effect={badge.effect}
                is_animated={badge.is_animated}
                size="lg"
                showTooltip={false}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{badge.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {badge.category} • Priority {badge.priority}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Manage users"
                  onClick={() => {
                    setSelectedBadgeForManage(badge);
                    setManageUsersDialogOpen(true);
                  }}
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Edit badge"
                  onClick={() => openEditDialog(badge)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  title="Delete badge"
                  onClick={() => {
                    if (confirm('Delete this badge?')) {
                      deleteBadge.mutate(badge.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBadge ? 'Edit Badge' : 'Create Badge'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Preview */}
            <div className="flex justify-center p-4 bg-secondary/50 rounded-lg">
              <div className="text-center">
                <BadgeIcon
                  icon={formData.icon}
                  name={formData.name || 'Preview'}
                  gradient_from={formData.gradient_from || null}
                  gradient_to={formData.gradient_to || null}
                  effect={formData.effect === 'none' ? null : formData.effect}
                  is_animated={formData.is_animated}
                  size="lg"
                  showTooltip={false}
                />
                <p className="text-sm font-medium mt-2">{formData.name || 'Badge Name'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="Badge name"
                />
              </div>
              <div className="space-y-2">
                <Label>Icon (emoji) *</Label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData(f => ({ ...f, icon: e.target.value }))}
                  placeholder="🏆"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Badge description..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData(f => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority (lower = higher)</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(f => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gradient From (HSL)</Label>
                <Input
                  value={formData.gradient_from}
                  onChange={(e) => setFormData(f => ({ ...f, gradient_from: e.target.value }))}
                  placeholder="45 100% 60%"
                />
              </div>
              <div className="space-y-2">
                <Label>Gradient Via (optional)</Label>
                <Input
                  value={formData.gradient_via}
                  onChange={(e) => setFormData(f => ({ ...f, gradient_via: e.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-2">
                <Label>Gradient To (HSL)</Label>
                <Input
                  value={formData.gradient_to}
                  onChange={(e) => setFormData(f => ({ ...f, gradient_to: e.target.value }))}
                  placeholder="35 100% 50%"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effect</Label>
                <Select
                  value={formData.effect}
                  onValueChange={(v) => setFormData(f => ({ ...f, effect: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EFFECT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 pt-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_animated}
                    onCheckedChange={(v) => setFormData(f => ({ ...f, is_animated: v }))}
                  />
                  <Label>Animated</Label>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_staff_badge}
                  onCheckedChange={(v) => setFormData(f => ({ ...f, is_staff_badge: v }))}
                />
                <Label>Staff Badge</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.can_be_disabled}
                  onCheckedChange={(v) => setFormData(f => ({ ...f, can_be_disabled: v }))}
                />
                <Label>Can Be Disabled</Label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={createBadge.isPending || updateBadge.isPending}
              >
                {(createBadge.isPending || updateBadge.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingBadge ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Users Dialog (combined add + view holders) */}
      <Dialog open={manageUsersDialogOpen} onOpenChange={setManageUsersDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedBadgeForManage && (
                <>
                  <BadgeIcon
                    icon={selectedBadgeForManage.icon}
                    name={selectedBadgeForManage.name}
                    gradient_from={selectedBadgeForManage.gradient_from}
                    gradient_to={selectedBadgeForManage.gradient_to}
                    size="sm"
                    showTooltip={false}
                  />
                  <span>Manage {selectedBadgeForManage.name}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Add User Section */}
            <div className="space-y-2 pb-3 border-b">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add User
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={awardUsername}
                  onChange={(e) => {
                    setAwardUsername(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder="Search by username or display name..."
                  className="pl-9"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              
              {/* Search Results Dropdown */}
              {userSearchResults.length > 0 && !selectedUser && (
                <div className="border rounded-lg bg-popover shadow-lg max-h-32 overflow-y-auto">
                  {userSearchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setAwardUsername(user.display_name || user.username);
                        setUserSearchResults([]);
                      }}
                      className="w-full flex items-center gap-3 p-2 hover:bg-secondary/50 transition-colors text-left"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {(user.display_name || user.username)[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {user.display_name || user.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          @{user.username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Selected User Preview with Award Button */}
              {selectedUser && (
                <div className="flex items-center gap-3 p-2 bg-primary/10 rounded-lg border border-primary/30">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedUser.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {(selectedUser.display_name || selectedUser.username)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {selectedUser.display_name || selectedUser.username}
                    </p>
                    <p className="text-xs text-muted-foreground">@{selectedUser.username}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAwardBadge}
                    disabled={awardBadge.isPending}
                  >
                    {awardBadge.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      setSelectedUser(null);
                      setAwardUsername('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Current Holders Section */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Users className="h-4 w-4" />
                Current Holders ({badgeHolders?.length || 0})
              </Label>
              
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {holdersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !badgeHolders || badgeHolders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No one has this badge yet</p>
                      <p className="text-xs mt-1">Search above to add users</p>
                    </div>
                  ) : (
                    badgeHolders.map((holder) => (
                      <div
                        key={holder.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={holder.avatar_url || undefined} />
                          <AvatarFallback>
                            {(holder.display_name || holder.username)[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <StyledUsername
                            userId={holder.profile_id}
                            username={holder.username}
                            displayName={holder.display_name}
                            className="font-medium text-sm"
                          />
                          <p className="text-xs text-muted-foreground">
                            @{holder.username} • {new Date(holder.earned_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Remove badge"
                          onClick={() => handleRemoveBadge(holder)}
                          disabled={removeBadge.isPending}
                        >
                          {removeBadge.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserMinus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <div className="flex justify-end pt-3 border-t">
            <Button variant="outline" onClick={() => setManageUsersDialogOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
