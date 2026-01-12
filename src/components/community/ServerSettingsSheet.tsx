import { useState, memo } from 'react';
import { Settings, Trash2, RefreshCw, Globe, Lock, Copy, Check, Users, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { useServer, useServerMembers, useChannels, useLeaveServer, useRemoveServerMember, useUpdateServerMemberRole, ServerRole } from '@/hooks/useServers';
import { useUpdateServer, useDeleteServer, useRegenerateInviteCode, useDeleteChannel } from '@/hooks/useServerSettings';
import { toast } from 'sonner';

interface ServerSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  myRole: ServerRole | null;
  onServerDeleted?: () => void;
}

export const ServerSettingsSheet = memo(function ServerSettingsSheet({
  open,
  onOpenChange,
  serverId,
  myRole,
  onServerDeleted,
}: ServerSettingsSheetProps) {
  const { data: server } = useServer(serverId);
  const { data: members = [] } = useServerMembers(serverId);
  const { data: channels = [] } = useChannels(serverId);
  
  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();
  const regenerateInvite = useRegenerateInviteCode();
  const leaveServer = useLeaveServer();
  const removeMember = useRemoveServerMember();
  const updateRole = useUpdateServerMemberRole();
  const deleteChannel = useDeleteChannel();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'channels'>('general');

  const isOwner = myRole === 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  // Sync state when server loads
  useState(() => {
    if (server) {
      setName(server.name || '');
      setDescription(server.description || '');
      setIsPublic(server.is_public);
    }
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Server name is required');
      return;
    }

    await updateServer.mutateAsync({
      serverId,
      name: name.trim(),
      description: description.trim() || undefined,
      isPublic,
    });
  };

  const handleCopyInvite = () => {
    if (server?.invite_code) {
      navigator.clipboard.writeText(server.invite_code);
      setCopiedInvite(true);
      toast.success('Invite code copied!');
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  const handleRegenerateInvite = async () => {
    await regenerateInvite.mutateAsync(serverId);
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

  const handleDeleteChannel = async (channelId: string) => {
    await deleteChannel.mutateAsync({ channelId, serverId });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Server Settings
          </SheetTitle>
        </SheetHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 mt-4 mb-6">
          <Button
            variant={activeTab === 'general' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('general')}
          >
            General
          </Button>
          <Button
            variant={activeTab === 'members' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('members')}
          >
            <Users className="h-4 w-4 mr-1" />
            Members ({members.length})
          </Button>
          {canManage && (
            <Button
              variant={activeTab === 'channels' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('channels')}
            >
              <Hash className="h-4 w-4 mr-1" />
              Channels
            </Button>
          )}
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Server Name */}
            {canManage && (
              <div className="space-y-2">
                <Label htmlFor="server-name">Server Name</Label>
                <Input
                  id="server-name"
                  value={name || server?.name || ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter server name"
                />
              </div>
            )}

            {/* Description */}
            {canManage && (
              <div className="space-y-2">
                <Label htmlFor="server-description">Description</Label>
                <Textarea
                  id="server-description"
                  value={description || server?.description || ''}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this server about?"
                  rows={3}
                />
              </div>
            )}

            {/* Visibility */}
            {canManage && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  <div>
                    <p className="font-medium text-sm">Public Server</p>
                    <p className="text-xs text-muted-foreground">
                      {isPublic ? 'Anyone can find and join' : 'Invite only'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>
            )}

            {/* Invite Code */}
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <div className="flex gap-2">
                <Input
                  value={server?.invite_code || ''}
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={handleCopyInvite}>
                  {copiedInvite ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                {canManage && (
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleRegenerateInvite}
                    disabled={regenerateInvite.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerateInvite.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>

            {/* Save button */}
            {canManage && (
              <Button 
                className="w-full" 
                onClick={handleSave}
                disabled={updateServer.isPending}
              >
                {updateServer.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            )}

            <Separator />

            {/* Danger zone */}
            <div className="space-y-3">
              {!isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive border-destructive">
                      Leave Server
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave Server?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to leave this server? You'll need an invite to rejoin.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLeaveServer} className="bg-destructive text-destructive-foreground">
                        Leave
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Server
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Server?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. All channels and messages will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteServer} className="bg-destructive text-destructive-foreground">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                    {(member.profile?.display_name || member.profile?.username)?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {member.profile?.display_name || member.profile?.username}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                  </div>
                </div>

                {canManage && member.role !== 'owner' && (
                  <div className="flex gap-2">
                    {isOwner && (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.user_id, e.target.value as ServerRole)}
                        className="text-xs border rounded px-2 py-1 bg-background"
                      >
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7"
                      onClick={() => handleKickMember(member.user_id)}
                    >
                      Kick
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {members.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No members</p>
            )}
          </div>
        )}

        {/* Channels Tab */}
        {activeTab === 'channels' && canManage && (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div key={channel.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{channel.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">({channel.type})</span>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive h-7">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete #{channel.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the channel and all its messages.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleDeleteChannel(channel.id)} 
                        className="bg-destructive text-destructive-foreground"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}

            {channels.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No channels</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
});
