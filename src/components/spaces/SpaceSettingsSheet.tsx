/**
 * SpaceSettingsSheet - Simple settings sheet for VYBE Spaces
 * Only 3 roles: Owner, Moderator, Member
 */

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Crown, 
  Shield, 
  User,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  LogOut,
  Camera,
  Globe,
  Lock,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useServer, useServerMembers, ServerRole } from '@/hooks/useServers';
import { useUpdateServer, useDeleteServer, useRegenerateInviteCode } from '@/hooks/useServerSettings';
import { toast } from 'sonner';

interface SpaceSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  myRole: ServerRole | null;
  onSpaceDeleted?: () => void;
}

const roleConfig = {
  owner: { icon: Crown, label: 'Owner', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' },
  admin: { icon: Shield, label: 'Moderator', color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  member: { icon: User, label: 'Member', color: 'text-muted-foreground', bgColor: 'bg-muted' },
};

export function SpaceSettingsSheet({ 
  open, 
  onOpenChange, 
  spaceId, 
  myRole,
  onSpaceDeleted 
}: SpaceSettingsSheetProps) {
  const { data: space } = useServer(spaceId);
  const { data: members = [] } = useServerMembers(spaceId);
  
  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();
  const regenerateInvite = useRegenerateInviteCode();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const isOwner = myRole === 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  useEffect(() => {
    if (space) {
      setName(space.name);
      setDescription(space.description || '');
      setIsPublic(space.is_public);
    }
  }, [space]);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    try {
      await updateServer.mutateAsync({
        serverId: spaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      toast.success('Space updated!');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCopyInvite = () => {
    if (space?.invite_code) {
      navigator.clipboard.writeText(space.invite_code);
      setCopiedInvite(true);
      toast.success('Invite code copied!');
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  const handleRegenerateInvite = async () => {
    try {
      await regenerateInvite.mutateAsync(spaceId);
      toast.success('New invite code generated!');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteSpace = async () => {
    try {
      await deleteServer.mutateAsync(spaceId);
      onOpenChange(false);
      onSpaceDeleted?.();
      toast.success('Space deleted');
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0">
        <SheetHeader className="px-6 pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center">
              <Settings className="h-4 w-4" />
            </div>
            Space Settings
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col h-[calc(100%-60px)]">
          <TabsList className="mx-6 mt-4 mb-2 grid grid-cols-2 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="general" className="rounded-lg">General</TabsTrigger>
            <TabsTrigger value="members" className="rounded-lg">Members</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            {/* General Tab */}
            <TabsContent value="general" className="mt-0 px-6 py-4 space-y-6">
              {canManage ? (
                <>
                  {/* Space icon */}
                  <div className="flex justify-center">
                    <button className="relative group">
                      <Avatar className="h-20 w-20 ring-4 ring-muted">
                        {space?.icon_url && <AvatarImage src={space.icon_url} />}
                        <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-lg font-bold">
                          {space?.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </button>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label>Space Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 rounded-xl bg-muted/50 border-0"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-[80px] rounded-xl bg-muted/50 border-0 resize-none"
                    />
                  </div>

                  {/* Visibility */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      {isPublic ? (
                        <Globe className="h-5 w-5 text-primary" />
                      ) : (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{isPublic ? 'Public' : 'Private'}</p>
                        <p className="text-xs text-muted-foreground">
                          {isPublic ? 'Anyone can find and join' : 'Invite only'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                  </div>

                  {/* Save button */}
                  <Button 
                    className="w-full h-12 rounded-xl"
                    onClick={handleSave}
                    disabled={updateServer.isPending}
                  >
                    {updateServer.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              ) : (
                <div className="text-center py-8">
                  <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Only moderators can edit settings</p>
                </div>
              )}

              {/* Invite code section */}
              <div className="p-4 rounded-2xl bg-muted/50 space-y-3">
                <p className="font-medium text-sm">Invite Code</p>
                <div className="flex gap-2">
                  <Input
                    value={space?.invite_code || ''}
                    readOnly
                    className="h-10 rounded-xl bg-background font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-10 w-10 rounded-xl flex-shrink-0"
                    onClick={handleCopyInvite}
                  >
                    {copiedInvite ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 rounded-xl flex-shrink-0"
                      onClick={handleRegenerateInvite}
                      disabled={regenerateInvite.isPending}
                    >
                      <RefreshCw className={cn(
                        "h-4 w-4",
                        regenerateInvite.isPending && "animate-spin"
                      )} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Danger zone */}
              <div className="pt-4 space-y-3">
                {isOwner ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full h-12 rounded-xl">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Space
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this space?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the space and all its content. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleDeleteSpace}
                          className="rounded-xl bg-destructive text-destructive-foreground"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button variant="outline" className="w-full h-12 rounded-xl text-destructive border-destructive/30">
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Space
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-0 px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">Members</h3>
                  <p className="text-xs text-muted-foreground">{members.length} total</p>
                </div>
              </div>

              <div className="space-y-2">
                {members.map((member) => {
                  const roleInfo = roleConfig[member.role as keyof typeof roleConfig] || roleConfig.member;
                  const RoleIcon = roleInfo.icon;

                  return (
                    <div 
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30"
                    >
                      <Avatar className="h-10 w-10">
                        {member.profile?.avatar_url && (
                          <AvatarImage src={member.profile.avatar_url} />
                        )}
                        <AvatarFallback>
                          {member.profile?.username?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {member.nickname || member.profile?.display_name || member.profile?.username}
                        </p>
                        <p className="text-xs text-muted-foreground">@{member.profile?.username}</p>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                        roleInfo.bgColor,
                        roleInfo.color
                      )}>
                        <RoleIcon className="h-3 w-3" />
                        <span>{roleInfo.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
