import { CommunityAvatarImage as AvatarImage } from './CommunityAvatarImage';
import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useEffect, useState, memo, useRef, useCallback } from 'react';
import {
  Settings, Trash2, RefreshCw, Globe, Lock, Copy, Check, Users, Hash,
  Camera, Loader2, Plus, Shield, Crown, ChevronRight, X, Megaphone,
  Volume2, GripVertical, Ban, UserX, LogOut, Link2, Sparkles,
  AlertTriangle, Eye, Palette, Bell, Gavel
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServer, useServerMembers, useChannels, useLeaveServer, useRemoveServerMember, useUpdateServerMemberRole, ServerRole } from '@/hooks/useServers';
import { useUpdateServer, useDeleteServer, useRegenerateInviteCode, useDeleteChannel, useUploadServerIcon } from '@/hooks/useServerSettings';
import { useChannelPermissions, useUpdateChannelPermission } from '@/hooks/useChannelPermissions';
import { CreateChannelDialog } from './CreateChannelDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';

type ManagementTab = 'overview' | 'members' | 'channels' | 'roles' | 'moderation' | 'invites' | 'safety';

interface ServerManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  myRole: ServerRole | null;
  onServerDeleted?: () => void;
}

const NAV_ITEMS: { id: ManagementTab; label: string; icon: any; requiresManage?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: Settings },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'channels', label: 'Channels', icon: Hash, requiresManage: true },
  { id: 'roles', label: 'Roles', icon: Crown, requiresManage: true },
  { id: 'moderation', label: 'Moderation', icon: Gavel, requiresManage: true },
  { id: 'invites', label: 'Invites', icon: Link2 },
  { id: 'safety', label: 'Safety', icon: Shield },
];

export const ServerManagement = memo(function ServerManagement({
  open,
  onOpenChange,
  serverId,
  myRole,
  onServerDeleted,
}: ServerManagementProps) {
  const communityRequest = useCommunityRequest();
  const { data: server } = useServer(serverId);
  const queryClient = useQueryClient();
  const { data: members = [] } = useServerMembers(serverId);
  const { data: channels = [] } = useChannels(serverId);

  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();
  const regenerateInvite = useRegenerateInviteCode();
  const leaveServer = useLeaveServer();
  const removeMember = useRemoveServerMember();
  const updateRole = useUpdateServerMemberRole();
  const deleteChannel = useDeleteChannel();
  const uploadIcon = useUploadServerIcon();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ManagementTab>('overview');
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);

  const isOwner = myRole === 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  // Sync state when server loads
  useEffect(() => {
    if (server) {
      setName(server.name || '');
      setDescription(server.description || '');
      setIsPublic(server.is_public);
    }
  }, [server?.id]);

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }

    const reader = new FileReader();
    reader.onload = (e) => setIconPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploadingIcon(true);
    try {
      const publicUrl = await uploadIcon.mutateAsync({ serverId, file });
      await updateServer.mutateAsync({ serverId, iconUrl: publicUrl });
      toast.success('Server icon updated!');
    } catch { setIconPreview(null); }
    finally { setIsUploadingIcon(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Server name is required'); return; }
    await updateServer.mutateAsync({ serverId, name: name.trim(), description: description.trim() || undefined, isPublic });
  };

  const handleCopyInvite = () => {
    if (server?.invite_code) {
      navigator.clipboard.writeText(server.invite_code);
      setCopiedInvite(true);
      toast.success('Invite code copied!');
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  const handleDeleteServer = async () => {
    await deleteServer.mutateAsync(serverId);
    onOpenChange(false);
    onServerDeleted?.();
  };

  const handleLeaveServer = async () => {
    await leaveServer.mutateAsync(serverId);
    onOpenChange(false);
    onServerDeleted?.();
  };

  const handleKickMember = async (userId: string) => {
    await removeMember.mutateAsync({ serverId, userId });
  };

  const handleChangeRole = async (userId: string, role: ServerRole) => {
    await updateRole.mutateAsync({ serverId, userId, role });
  };
  const transfer = useCommunityMutation({
    mutationFn: (userId: string) => communityRequest('community-manage', { action: 'transferOwnership', serverId, userId }),
    onSuccess: () => {
      ['my-servers', 'my-communities', 'server', 'community', 'server-members', 'community-members', 'my-server-role', 'my-community-role'].forEach(key => { queryClient.invalidateQueries({ queryKey: [key] }); });
      toast.success('Ownership transferred. Your account is now a member.');
    },
    onError: error => { toast.error(error.message || 'Could not transfer ownership'); },
  });
  const handleTransfer = (userId: string) => { transfer.mutate(userId); };

  const handleDeleteChannel = async (channelId: string) => {
    await deleteChannel.mutateAsync({ channelId, serverId });
  };

  const filteredNavItems = NAV_ITEMS.filter(item =>
    !item.requiresManage || canManage
  );

  const roleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'text-amber-400';
      case 'admin': return 'text-red-400';
      case 'moderator': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      case 'admin': return 'bg-red-500/15 text-red-400 border-red-500/20';
      case 'moderator': return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden rounded-2xl border-border/50 bg-background [&>button]:hidden">
        <DialogTitle className="sr-only">Server Settings</DialogTitle>
        <div className="flex h-full">
          {/* Sidebar Navigation - hidden on mobile, use hamburger */}
          <div className="hidden md:flex flex-col w-56 bg-muted/30 border-r border-border/50 shrink-0">
            {/* Server identity */}
            <div className="p-4 border-b border-border/30">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={iconPreview || server?.icon_url || undefined} />
                  <AvatarFallback className="bg-primary/20 font-bold">
                    {(server?.name)?.[0]?.toUpperCase() || 'S'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{server?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{members.length} members</p>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <ScrollArea className="flex-1 p-2">
              <nav className="space-y-0.5">
                {filteredNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                      activeTab === item.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                    {item.id === 'members' && (
                      <span className="ml-auto text-[10px] opacity-60">{members.length}</span>
                    )}
                    {item.id === 'channels' && (
                      <span className="ml-auto text-[10px] opacity-60">{channels.length}</span>
                    )}
                  </button>
                ))}
              </nav>

              <Separator className="my-3" />

              {/* Danger actions */}
              <div className="space-y-1">
                {!isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/5 transition-all">
                        <LogOut className="h-4 w-4" />
                        Leave Server
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Leave Server?</AlertDialogTitle>
                        <AlertDialogDescription>You'll need an invite to rejoin.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLeaveServer} className="bg-destructive text-destructive-foreground">Leave</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/5 transition-all">
                        <Trash2 className="h-4 w-4" />
                        Delete Server
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Server?</AlertDialogTitle>
                        <AlertDialogDescription>Archiving closes this community and its invitations. Stored messages are retained.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteServer} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/30">
              {/* Mobile nav toggle */}
              <div className="flex items-center gap-3">
                <div className="md:hidden">
                  <Select
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as ManagementTab)}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredNavItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex items-center gap-2">
                            <item.icon className="h-3.5 w-3.5" />
                            {item.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <h2 className="hidden md:block text-lg font-bold">
                  {filteredNavItems.find(i => i.id === activeTab)?.label}
                </h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Tab Content */}
            <ScrollArea className="flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="p-4 md:p-6"
                >
                  {activeTab === 'overview' && (
                    <OverviewTab
                      server={server}
                      name={name}
                      setName={setName}
                      description={description}
                      setDescription={setDescription}
                      isPublic={isPublic}
                      setIsPublic={setIsPublic}
                      canManage={canManage}
                      iconPreview={iconPreview}
                      isUploadingIcon={isUploadingIcon}
                      fileInputRef={fileInputRef}
                      handleIconChange={handleIconChange}
                      handleSave={handleSave}
                      isSaving={updateServer.isPending}
                    />
                  )}

                  {activeTab === 'members' && (
                    <MembersTab
                      members={members}
                      canManage={canManage}
                      isOwner={isOwner}
                      handleKickMember={handleKickMember}
                      handleChangeRole={handleChangeRole}
                      handleTransfer={handleTransfer}
                      roleBadgeVariant={roleBadgeVariant}
                    />
                  )}

                  {activeTab === 'channels' && canManage && (
                    <ChannelsTab
                      channels={channels}
                      handleDeleteChannel={handleDeleteChannel}
                      setShowCreateChannel={setShowCreateChannel}
                    />
                  )}

                  {activeTab === 'roles' && canManage && (
                    <RolesTab members={members} roleBadgeVariant={roleBadgeVariant} />
                  )}

                  {activeTab === 'moderation' && canManage && (
                    <ModerationTab />
                  )}

                  {activeTab === 'invites' && (
                    <InvitesTab
                      server={server}
                      canManage={canManage}
                      copiedInvite={copiedInvite}
                      handleCopyInvite={handleCopyInvite}
                      handleRegenerateInvite={() => regenerateInvite.mutateAsync(serverId)}
                      isRegenerating={regenerateInvite.isPending}
                    />
                  )}

                  {activeTab === 'safety' && (
                    <SafetyTab />
                  )}
                </motion.div>
              </AnimatePresence>
            </ScrollArea>
          </div>
        </div>

        <CreateChannelDialog
          open={showCreateChannel}
          onOpenChange={setShowCreateChannel}
          serverId={serverId}
        />
      </DialogContent>
    </Dialog>
  );
});

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────
function OverviewTab({ server, name, setName, description, setDescription, isPublic, setIsPublic, canManage, iconPreview, isUploadingIcon, fileInputRef, handleIconChange, handleSave, isSaving }: any) {
  return (
    <div className="space-y-6 max-w-lg">
      {/* Server Icon */}
      {canManage && (
        <div className="flex items-center gap-5">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border rounded-2xl">
              <AvatarImage src={iconPreview || server?.icon_url || undefined} className="rounded-2xl" />
              <AvatarFallback className="text-2xl font-bold bg-primary/20 rounded-2xl">
                {(name || server?.name)?.[0]?.toUpperCase() || 'S'}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingIcon}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {isUploadingIcon ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Camera className="h-6 w-6 text-white" />}
            </button>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingIcon} className="rounded-xl">
              {isUploadingIcon ? 'Uploading...' : 'Change Icon'}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG or GIF. Max 5MB.</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconChange} className="hidden" />
        </div>
      )}

      {canManage && (
        <>
          <div className="space-y-2">
            <Label htmlFor="mgmt-server-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Server Name</Label>
            <Input id="mgmt-server-name" value={name || server?.name || ''} onChange={(e) => setName(e.target.value)} placeholder="Enter server name" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgmt-server-desc" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
            <Textarea id="mgmt-server-desc" value={description || server?.description || ''} onChange={(e) => setDescription(e.target.value)} placeholder="What's this server about?" rows={3} className="rounded-xl resize-none" />
          </div>
        </>
      )}

      {canManage && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              {isPublic ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-primary" />}
            </div>
            <div>
              <p className="font-medium text-sm">Public Server</p>
              <p className="text-[10px] text-muted-foreground">{isPublic ? 'Anyone can discover & join' : 'Invite only'}</p>
            </div>
          </div>
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
        </div>
      )}

      {canManage && (
        <Button className="w-full rounded-xl" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Save Changes'}
        </Button>
      )}

      {!canManage && server && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 rounded-2xl">
              <AvatarImage src={server.icon_url || undefined} className="rounded-2xl" />
              <AvatarFallback className="text-xl font-bold bg-primary/20 rounded-2xl">{server.name?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-bold text-lg">{server.name}</h3>
              {server.description && <p className="text-sm text-muted-foreground">{server.description}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MEMBERS TAB ─────────────────────────────────────────────────────
function MembersTab({ members, canManage, isOwner, handleKickMember, handleChangeRole, handleTransfer, roleBadgeVariant }: any) {
  const [search, setSearch] = useState('');
  const filtered = members.filter((m: any) => {
    const name = (m.profile?.display_name || m.profile?.username || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-xl"
      />

      <div className="space-y-1">
        {filtered.map((member: any) => (
          <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9">
                <AvatarImage src={member.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10">
                  {(member.profile?.display_name || member.profile?.username)?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{member.profile?.display_name || member.profile?.username}</p>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md border inline-block capitalize", roleBadgeVariant(member.role))}>
                  {member.role}
                </span>
              </div>
            </div>

            {canManage && member.role !== 'owner' && (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs">Make owner</Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Transfer community ownership?</AlertDialogTitle>
                      <AlertDialogDescription>{member.profile?.display_name || member.profile?.username} will become the owner. You will become a member and can then leave the community.</AlertDialogDescription>
                    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleTransfer(member.user_id)}>Transfer ownership</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                )}
                {isOwner && (
                  <Select value={member.role} onValueChange={(v) => handleChangeRole(member.user_id, v)}>
                    <SelectTrigger className="h-7 w-[100px] text-[11px] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" size="sm" className="text-destructive h-7 rounded-lg text-xs" onClick={() => handleKickMember(member.user_id)}>
                  <UserX className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No members found</p>}
      </div>
    </div>
  );
}

// ─── CHANNELS TAB ────────────────────────────────────────────────────
function ChannelsTab({ channels, handleDeleteChannel, setShowCreateChannel }: any) {
  const [editingPermsChannel, setEditingPermsChannel] = useState<string | null>(null);

  const channelIcon = (type: string) => {
    switch (type) {
      case 'voice': return <Volume2 className="h-4 w-4 text-green-400" />;
      case 'announcement': return <Megaphone className="h-4 w-4 text-amber-400" />;
      default: return <Hash className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowCreateChannel(true)} className="w-full gap-2 rounded-xl">
        <Plus className="h-4 w-4" />
        Create Channel
      </Button>

      <div className="space-y-1">
        {channels.map((channel: any) => (
          <div key={channel.id} className="rounded-xl border border-border/30 overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-card/60 hover:border-border/60 transition-colors group">
              <div className="flex items-center gap-3">
                {channelIcon(channel.type)}
                <div>
                  <p className="font-medium text-sm">{channel.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{channel.type} channel</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                  onClick={() => setEditingPermsChannel(editingPermsChannel === channel.id ? null : channel.id)}
                >
                  <Shield className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete #{channel.name}?</AlertDialogTitle>
                      <AlertDialogDescription>This will archive the channel and hide its messages from members.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteChannel(channel.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Permission Editor */}
            <AnimatePresence>
              {editingPermsChannel === channel.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ChannelPermissionEditor channelId={channel.id} announcement={channel.type === 'announcement' || channel.room_type === 'announcements'} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {channels.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No channels yet</p>}
      </div>
    </div>
  );
}

// ─── CHANNEL PERMISSION EDITOR ───────────────────────────────────────
function ChannelPermissionEditor({ channelId, announcement }: { channelId: string; announcement: boolean }) {
  const { data: permissions = [] } = useChannelPermissions(channelId);
  const updatePerm = useUpdateChannelPermission();

  const editableRoles = ['moderator', 'member'];
  const permFields = [
    { key: 'can_view', label: 'View', icon: Eye },
    { key: 'can_send', label: 'Send', icon: Hash },
    { key: 'can_pin', label: 'Pin', icon: Sparkles },
    { key: 'can_attach_media', label: 'Media', icon: Camera },
  ] as const;

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    moderator: 'Mod',
    member: 'Member',
  };

  return (
    <div className="px-3 py-3 border-t border-border/20 bg-muted/10 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Role Permissions</p>
      <p className="text-[10px] text-muted-foreground mb-3">Owners and administrators have full access. Moderators can pin. Announcement posting requires a moderator or higher role.</p>
      
      {/* Header */}
      <div className="grid grid-cols-5 gap-1 text-[9px] text-muted-foreground uppercase tracking-wider font-semibold px-1">
        <span>Role</span>
        {permFields.map(f => (
          <span key={f.key} className="text-center">{f.label}</span>
        ))}
      </div>

      {editableRoles.map(role => {
        const perm = permissions.find((p: any) => p.role === role);
        if (!perm) return null;
        const effective = { can_view: perm.can_view === true,
          can_send: perm.can_view === true && perm.can_send !== false && !(announcement && role === 'member'),
          can_pin: perm.can_view === true && (role === 'moderator' || perm.can_pin === true),
          can_attach_media: perm.can_view === true && perm.can_attach_media !== false };

        return (
          <div key={role} className="grid grid-cols-5 gap-1 items-center py-1.5 px-1 rounded-lg hover:bg-muted/20 transition-colors">
            <span className={cn(
              "text-xs font-medium capitalize",
              role === 'admin' ? 'text-red-400' : role === 'moderator' ? 'text-blue-400' : 'text-muted-foreground'
            )}>
              {roleLabels[role]}
            </span>
            {permFields.map(f => (
              <div key={f.key} className="flex justify-center">
                <Switch
                  checked={effective[f.key]}
                  disabled={updatePerm.isPending || (f.key !== 'can_view' && !effective.can_view) || (f.key === 'can_pin' && role === 'moderator') || (f.key === 'can_send' && announcement && role === 'member')}
                  onCheckedChange={(checked) => {
                    updatePerm.mutate({
                      channelId,
                      role,
                      field: f.key,
                      value: checked,
                    });
                  }}
                  className="scale-75"
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── ROLES TAB ───────────────────────────────────────────────────────
function RolesTab({ members, roleBadgeVariant }: any) {
  const roleGroups: Record<string, any[]> = { owner: [], admin: [], moderator: [], member: [] };
  members.forEach((m: any) => {
    if (roleGroups[m.role]) roleGroups[m.role].push(m);
  });

  const roleConfig = [
    { role: 'owner', label: 'Owner', desc: 'Full control — all permissions on all channels', icon: Crown, color: 'text-amber-400' },
    { role: 'admin', label: 'Admins', desc: 'Can manage channels, members, settings & permissions', icon: Shield, color: 'text-red-400' },
    { role: 'moderator', label: 'Moderators', desc: 'Can pin messages & moderate members per channel', icon: Gavel, color: 'text-blue-400' },
    { role: 'member', label: 'Members', desc: 'Standard access — configurable per channel', icon: Users, color: 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Manage role assignments from the Members tab. Here you can see the role hierarchy.</p>

      {roleConfig.map(({ role, label, desc, icon: Icon, color }) => (
        <div key={role} className="rounded-xl border border-border/40 overflow-hidden">
          <div className="flex items-center gap-3 p-3 bg-card/50">
            <Icon className={cn("h-4 w-4", color)} />
            <div className="flex-1">
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
            <span className="text-xs text-muted-foreground">{roleGroups[role]?.length || 0}</span>
          </div>
          {(roleGroups[role]?.length > 0) && (
            <div className="px-3 py-2 space-y-1 bg-background/50">
              {roleGroups[role].map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 py-1">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">{(m.profile?.display_name || m.profile?.username)?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{m.profile?.display_name || m.profile?.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── MODERATION TAB ──────────────────────────────────────────────────
function ModerationTab() {
  return (
    <div className="space-y-6 max-w-lg">
      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">Auto-Moderation</p>
            <p className="text-[10px] text-muted-foreground">Automatically filter inappropriate content</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <span className="text-sm">Block profanity</span>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <span className="text-sm">Block links</span>
            <Switch />
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <span className="text-sm">Spam detection</span>
            <Switch defaultChecked />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Ban className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">Banned Words</p>
            <p className="text-[10px] text-muted-foreground">Messages containing these words will be auto-deleted</p>
          </div>
        </div>
        <Textarea placeholder="Enter words separated by commas..." rows={2} className="rounded-xl resize-none text-sm" />
        <Button size="sm" className="rounded-lg">Save</Button>
      </div>

      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">Slowmode</p>
            <p className="text-[10px] text-muted-foreground">Limit how often members can send messages</p>
          </div>
        </div>
        <Select defaultValue="off">
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="5">5 seconds</SelectItem>
            <SelectItem value="10">10 seconds</SelectItem>
            <SelectItem value="30">30 seconds</SelectItem>
            <SelectItem value="60">1 minute</SelectItem>
            <SelectItem value="300">5 minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── INVITES TAB ─────────────────────────────────────────────────────
function InvitesTab({ server, canManage, copiedInvite, handleCopyInvite, handleRegenerateInvite, isRegenerating }: any) {
  return (
    <div className="space-y-6 max-w-lg">
      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite Code</Label>
        <div className="flex gap-2">
          <Input value={server?.invite_code || ''} readOnly className="font-mono rounded-xl" />
          <Button variant="outline" size="icon" onClick={handleCopyInvite} className="shrink-0 rounded-xl">
            {copiedInvite ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={handleRegenerateInvite} disabled={isRegenerating} className="gap-2 rounded-xl">
            <RefreshCw className={cn("h-3.5 w-3.5", isRegenerating && "animate-spin")} />
            Regenerate
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">Share this code to let others join your server. {server?.invite_expires_at ? `Expires ${new Date(server.invite_expires_at).toLocaleString()}.` : 'Restore the community to create a new invitation.'}</p>
      </div>

      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Invite Link</p>
            <p className="text-[10px] text-muted-foreground">Share a direct link to your server</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={server?.invite_code ? `https://vybehub.app/community?join=${server.invite_code}` : ''} readOnly className="text-xs font-mono rounded-xl" />
          <Button variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={() => {
            if (server?.invite_code) {
              navigator.clipboard.writeText(`https://vybehub.app/community?join=${server.invite_code}`);
              toast.success('Link copied!');
            }
          }}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SAFETY TAB ──────────────────────────────────────────────────────
function SafetyTab() {
  return (
    <div className="space-y-6 max-w-lg">
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Your Safety Settings Apply Here</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your personal content filter level is applied to all server content. Media in channels is filtered based on your age and safety preferences.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 p-4 space-y-3">
        <p className="font-semibold text-sm">How it works</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
            <div className="h-7 w-7 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
              <Shield className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium">Protected</p>
              <p className="text-[10px] text-muted-foreground">All media is hidden until you choose to reveal it</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
            <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
              <Eye className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium">Moderate</p>
              <p className="text-[10px] text-muted-foreground">Media is scanned and shown with a safety badge</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
            <div className="h-7 w-7 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-medium">Unfiltered</p>
              <p className="text-[10px] text-muted-foreground">Baseline checks only (18+ required)</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        To change your safety level, go to Settings → Safety & Privacy
      </p>
    </div>
  );
}
