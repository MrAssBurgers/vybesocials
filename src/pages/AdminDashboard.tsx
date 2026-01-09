import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUserRole, useReports, useContentFlags, useUpdateReport, useUpdateFlag, useAllUserRoles, useAddUserRole, useRemoveUserRole } from '@/hooks/useModeration';
import { useAllWarnings, useAllBans, useUnbanUser } from '@/hooks/useModerationActions';
import { useAuth } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';
import { Shield, Flag, AlertTriangle, Users, Ban, CheckCircle, XCircle, Eye, UserPlus, Trash2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ModBadge } from '@/components/ui/ModBadge';

// Hook to search users for adding roles
function useSearchUsers(searchTerm: string) {
  return useQuery({
    queryKey: ['search-users', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2,
  });
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const { data: reports = [], isLoading: reportsLoading } = useReports();
  const { data: flags = [], isLoading: flagsLoading } = useContentFlags();
  const { data: warnings = [], isLoading: warningsLoading } = useAllWarnings();
  const { data: bans = [], isLoading: bansLoading } = useAllBans();
  const { data: userRoles = [], isLoading: rolesLoading } = useAllUserRoles();
  const updateReport = useUpdateReport();
  const updateFlag = useUpdateFlag();
  const unbanUser = useUnbanUser();
  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'moderator'>('moderator');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: searchResults = [] } = useSearchUsers(searchTerm);

  const isModOrAdmin = userRole === 'admin' || userRole === 'moderator';
  const isMrassburgers = profile?.username?.toLowerCase() === 'mrassburgers';
  const isOwner = isMrassburgers; // Owner can manage all roles

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isModOrAdmin && !isMrassburgers) {
    return <Navigate to="/home" replace />;
  }

  const pendingReports = reports.filter(r => r.status === 'pending');
  const pendingFlags = flags.filter(f => f.status === 'pending');

  const handleReportAction = async (id: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    if (!profile?.id) return;
    try {
      await updateReport.mutateAsync({ id, status, reviewed_by: profile.id });
      toast.success(`Report ${status}`);
    } catch {
      toast.error('Failed to update report');
    }
  };

  const handleFlagAction = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile?.id) return;
    try {
      await updateFlag.mutateAsync({ id, status, reviewed_by: profile.id });
      toast.success(`Content ${status}`);
    } catch {
      toast.error('Failed to update flag');
    }
  };

  const handleUnban = async (banId: string) => {
    try {
      await unbanUser.mutateAsync(banId);
    } catch {
      // Error handled by mutation
    }
  };

  const handleAddRole = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }
    try {
      await addUserRole.mutateAsync({ userId: selectedUserId, role: selectedRole });
      setSearchTerm('');
      setSelectedUserId(null);
      toast.success(`Role added successfully`);
    } catch {
      toast.error('Failed to add role');
    }
  };

  const handleRemoveRole = async (userId: string, role: 'admin' | 'moderator') => {
    try {
      await removeUserRole.mutateAsync({ userId, role });
      toast.success(`Role removed successfully`);
    } catch {
      toast.error('Failed to remove role');
    }
  };

  const selectUser = (user: any) => {
    setSelectedUserId(user.id);
    setSearchTerm(user.username);
  };

  return (
    <AppLayout>
      <div className="container max-w-6xl mx-auto p-4 pb-24 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage users, reports, and content</p>
          </div>
          {isOwner && (
            <Badge className="ml-auto bg-gradient-to-r from-yellow-500 to-amber-500 text-black">
              <Crown className="h-3 w-3 mr-1" /> Owner
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="liquid-glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{pendingReports.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Pending Reports</p>
            </CardContent>
          </Card>
          <Card className="liquid-glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">{pendingFlags.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Content Flags</p>
            </CardContent>
          </Card>
          <Card className="liquid-glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{warnings.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card className="liquid-glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">{bans.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Active Bans</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reports" className="space-y-4">
          <TabsList className="liquid-glass">
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="flags">Flags</TabsTrigger>
            <TabsTrigger value="warnings">Warnings</TabsTrigger>
            <TabsTrigger value="bans">Bans</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>

          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card className="liquid-glass">
              <CardHeader>
                <CardTitle>User Reports</CardTitle>
                <CardDescription>Review reported content</CardDescription>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : reports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No reports</div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {reports.map((report) => (
                        <div key={report.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={report.reporter?.avatar_url || ''} />
                                <AvatarFallback>{report.reporter?.username?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{report.reporter?.username}</span>
                            </div>
                            <Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'}>
                              {report.status}
                            </Badge>
                          </div>
                          <p className="text-sm">{report.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                          </p>
                          {report.status === 'pending' && (
                            <div className="flex gap-2 pt-2">
                              <Button size="sm" variant="outline" onClick={() => handleReportAction(report.id, 'reviewed')}>
                                <Eye className="h-4 w-4 mr-1" /> Review
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReportAction(report.id, 'actioned')}>
                                <CheckCircle className="h-4 w-4 mr-1" /> Action
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleReportAction(report.id, 'dismissed')}>
                                <XCircle className="h-4 w-4 mr-1" /> Dismiss
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Flags Tab */}
          <TabsContent value="flags">
            <Card className="liquid-glass">
              <CardHeader>
                <CardTitle>Content Flags</CardTitle>
                <CardDescription>AI-detected content for review</CardDescription>
              </CardHeader>
              <CardContent>
                {flagsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : flags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No flagged content</div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {flags.map((flag) => (
                        <div key={flag.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{flag.content_type}</Badge>
                            <Badge variant={flag.status === 'pending' ? 'destructive' : 'secondary'}>
                              {flag.status}
                            </Badge>
                          </div>
                          <p className="text-sm">{flag.flagged_text}</p>
                          {flag.ai_score !== null && (
                            <p className="text-xs text-muted-foreground">AI Score: {(flag.ai_score * 100).toFixed(0)}%</p>
                          )}
                          {flag.status === 'pending' && (
                            <div className="flex gap-2 pt-2">
                              <Button size="sm" variant="outline" onClick={() => handleFlagAction(flag.id, 'approved')}>
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleFlagAction(flag.id, 'rejected')}>
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Warnings Tab */}
          <TabsContent value="warnings">
            <Card className="liquid-glass">
              <CardHeader>
                <CardTitle>User Warnings</CardTitle>
                <CardDescription>All issued warnings</CardDescription>
              </CardHeader>
              <CardContent>
                {warningsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : warnings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No warnings issued</div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {warnings.map((warning: any) => (
                        <div key={warning.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={warning.user?.avatar_url || ''} />
                              <AvatarFallback>{warning.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{warning.user?.username}</span>
                          </div>
                          <p className="text-sm">{warning.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            By {warning.warned_by_profile?.username} • {formatDistanceToNow(new Date(warning.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bans Tab */}
          <TabsContent value="bans">
            <Card className="liquid-glass">
              <CardHeader>
                <CardTitle>User Bans</CardTitle>
                <CardDescription>Active and past bans</CardDescription>
              </CardHeader>
              <CardContent>
                {bansLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : bans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No bans</div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {bans.map((ban: any) => (
                        <div key={ban.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={ban.user?.avatar_url || ''} />
                                <AvatarFallback>{ban.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{ban.user?.username}</span>
                            </div>
                            <Badge variant={ban.is_permanent ? 'destructive' : 'secondary'}>
                              {ban.is_permanent ? 'Permanent' : 'Temporary'}
                            </Badge>
                          </div>
                          <p className="text-sm">{ban.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            By {ban.banned_by_profile?.username} • {formatDistanceToNow(new Date(ban.created_at), { addSuffix: true })}
                          </p>
                          {ban.expires_at && (
                            <p className="text-xs text-muted-foreground">
                              Expires: {new Date(ban.expires_at).toLocaleDateString()}
                            </p>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleUnban(ban.id)}>
                            Unban
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles">
            <Card className="liquid-glass">
              <CardHeader>
                <CardTitle>User Roles</CardTitle>
                <CardDescription>Admins and moderators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Role Section - Only for Owner */}
                {isOwner && (
                  <div className="p-4 rounded-lg bg-muted/20 border border-primary/20 space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Add Role
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Search username..."
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setSelectedUserId(null);
                          }}
                        />
                        {searchResults.length > 0 && !selectedUserId && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                            {searchResults.map((user: any) => (
                              <button
                                key={user.id}
                                onClick={() => selectUser(user)}
                                className="w-full p-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={user.avatar_url || ''} />
                                  <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm">@{user.username}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'admin' | 'moderator')}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moderator">Moderator</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAddRole} disabled={!selectedUserId || addUserRole.isPending}>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}

                {/* Existing Roles List */}
                {rolesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : userRoles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No assigned roles</div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {userRoles.map((roleEntry: any) => (
                        <div key={roleEntry.id} className="p-4 rounded-lg bg-muted/30 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={roleEntry.profile?.avatar_url || ''} />
                              <AvatarFallback>{roleEntry.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{roleEntry.profile?.display_name || roleEntry.profile?.username}</p>
                                <ModBadge role={roleEntry.role} showLabel />
                              </div>
                              <p className="text-sm text-muted-foreground">@{roleEntry.profile?.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveRole(roleEntry.profile?.id, roleEntry.role)}
                                disabled={removeUserRole.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
