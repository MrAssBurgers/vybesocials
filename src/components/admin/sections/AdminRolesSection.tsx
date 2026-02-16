import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllUserRoles, useAddUserRole, useRemoveUserRole } from '@/hooks/useModeration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, UserPlus, Trash2, Crown, Shield } from 'lucide-react';
import { toast } from 'sonner';

export function AdminRolesSection() {
  const { data: userRoles = [], isLoading } = useAllUserRoles();
  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('moderator');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: searchResults = [] } = useQuery({
    queryKey: ['search-users', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${searchTerm}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchTerm.length >= 2,
  });

  const handleAddRole = async () => {
    if (!selectedUserId) {
      toast.error('Select a user');
      return;
    }
    try {
      await addUserRole.mutateAsync({ userId: selectedUserId, role: selectedRole });
      setSearchTerm('');
      setSelectedUserId(null);
      toast.success('Role added');
    } catch {
      toast.error('Failed to add role');
    }
  };

  return (
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>Manage admin and moderator roles</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Role */}
        <div className="space-y-3 p-4 rounded-lg bg-muted/30">
          <h3 className="font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Role
          </h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedUserId(null);
                }}
              />
              {searchResults.length > 0 && searchTerm.length >= 2 && !selectedUserId && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                  {searchResults.map((user: any) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUserId(user.id);
                        setSearchTerm(user.username);
                      }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">@{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddRole} disabled={!selectedUserId}>
              Add
            </Button>
          </div>
        </div>

        {/* Role List */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
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
                    <p className="font-medium truncate">@{ur.profile?.username}</p>
                  </div>
                  <Badge className={ur.role === 'admin' ? 'bg-amber-500' : 'bg-primary'}>
                    {ur.role === 'admin' ? <Crown className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                    {ur.role}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeUserRole.mutate({ userId: ur.user_id, role: ur.role })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
