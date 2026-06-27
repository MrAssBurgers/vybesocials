import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAllUserRoles, useAddUserRole, useRemoveUserRole } from '@/hooks/useModeration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, Trash2, Crown, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AdminRolesSection() {
  const { data: userRoles = [], isLoading } = useAllUserRoles();
  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('moderator');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<{
    id: string;
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null>(null);

  const { data: searchResults = [] } = useQuery({
    queryKey: ['search-users', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${searchTerm}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchTerm.length >= 2,
    staleTime: 10_000,
  });

  const handleAddRole = () => {
    if (!selectedUserId) {
      toast.error('Select a user');
      return;
    }
    addUserRole.mutate(
      {
        userId: selectedUserId,
        role: selectedRole,
        profile: selectedProfile,
      },
      {
        onSuccess: () => {
          setSearchTerm('');
          setSelectedUserId(null);
          setSelectedProfile(null);
          toast.success('Role added');
        },
        onError: () => toast.error('Failed to add role'),
      },
    );
  };

  return (
    <Card className="liquid-glass flex flex-col max-h-[calc(100dvh-5rem)]">
      <CardHeader className="shrink-0 pb-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>Manage admin and moderator roles</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden pb-4">
        {/* Add Role */}
        <div className="shrink-0 space-y-3 p-4 rounded-lg bg-muted/30">
          <h3 className="font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Role
          </h3>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedUserId(null);
                  setSelectedProfile(null);
                }}
              />
              {searchResults.length > 0 && searchTerm.length >= 2 && !selectedUserId && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto overscroll-contain min-w-[220px]">
                  {searchResults.map((user: any) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(user.id);
                        setSelectedProfile(user);
                        setSearchTerm(user.username);
                      }}
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-muted text-left min-w-0"
                    >
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate" title={`@${user.username}`}>
                        @{user.username}
                        {user.display_name ? ` · ${user.display_name}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'admin' | 'moderator')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddRole} disabled={!selectedUserId || addUserRole.isPending}>
              {addUserRole.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
          </div>
        </div>

        {/* Role List — native scroll (ScrollArea breaks when flex height is unbounded) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-1 -mr-1">
          <div className="space-y-2 pb-2">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : userRoles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No roles assigned</div>
            ) : (
              userRoles.map((ur: any) => (
                <div key={ur.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Avatar>
                    <AvatarImage src={ur.profile?.avatar_url} />
                    <AvatarFallback>{ur.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">@{ur.profile?.username || ur.user_id.slice(0, 8)}</p>
                  </div>
                  <Badge className={ur.role === 'admin' ? 'bg-amber-500' : 'bg-primary'}>
                    {ur.role === 'admin' ? <Crown className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                    {ur.role}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive shrink-0"
                    disabled={removeUserRole.isPending}
                    onClick={() =>
                      removeUserRole.mutate(
                        { userId: ur.user_id, role: ur.role },
                        {
                          onSuccess: () => toast.success('Role removed'),
                          onError: () => toast.error('Failed to remove role'),
                        },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
