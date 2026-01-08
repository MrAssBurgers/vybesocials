import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Flag, AlertTriangle, CheckCircle, XCircle, Eye, Trash2, MessageSquare, Users, FileText, Search, Pin } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { 
  useContentFlags, 
  useReports, 
  useUpdateFlag, 
  useUpdateReport, 
  useUserRole,
  ContentFlag,
  Report
} from '@/hooks/useModeration';
import { AppLayout } from '@/components/layout/AppLayout';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

function FlagCard({ flag, onApprove, onReject }: { 
  flag: ContentFlag; 
  onApprove: () => void; 
  onReject: () => void;
}) {
  const categories = flag.ai_categories || {};
  const flaggedCategories = Object.entries(categories)
    .filter(([, value]) => value)
    .map(([key]) => key);

  return (
    <motion.div variants={itemVariants} layout>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={flag.status === 'pending' ? 'secondary' : flag.status === 'approved' ? 'default' : 'destructive'}>
                {flag.status}
              </Badge>
              <Badge variant="outline">{flag.content_type}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(flag.created_at).toLocaleDateString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm">{flag.flagged_text || 'No text available'}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">AI Score:</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div 
                className={`h-full ${
                  (flag.ai_score || 0) > 0.7 ? 'bg-destructive' : 
                  (flag.ai_score || 0) > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${(flag.ai_score || 0) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs font-mono">{((flag.ai_score || 0) * 100).toFixed(0)}%</span>
          </div>

          {flaggedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {flaggedCategories.map((cat) => (
                <Badge key={cat} variant="destructive" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          )}

          {flag.status === 'pending' && (
            <div className="flex gap-2 pt-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={onApprove}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Approve
              </Button>
              <Button 
                size="sm" 
                variant="destructive" 
                className="flex-1"
                onClick={onReject}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ReportCard({ report, onDismiss, onAction }: { 
  report: Report; 
  onDismiss: () => void; 
  onAction: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  return (
    <motion.div variants={itemVariants} layout>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={report.reporter?.avatar_url || ''} />
                <AvatarFallback>{report.reporter?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{report.reporter?.username}</span>
              <Badge variant={report.status === 'pending' ? 'secondary' : 'default'}>
                {report.status}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(report.created_at).toLocaleDateString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Reason:</span>
            <p className="text-sm mt-1">{report.reason}</p>
          </div>

          {report.post && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <span className="text-xs font-medium text-muted-foreground">Reported Content:</span>
              <p className="text-sm mt-1">{report.post.caption || 'Media post'}</p>
            </div>
          )}

          {report.status === 'pending' && (
            <>
              <AnimatePresence>
                {showNotes && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Textarea 
                      placeholder="Admin notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mb-2"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex-1"
                  onClick={onDismiss}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Dismiss
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  className="flex-1"
                  onClick={() => {
                    if (!showNotes) {
                      setShowNotes(true);
                    } else {
                      onAction(notes);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {showNotes ? 'Confirm Action' : 'Take Action'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Hook for fetching all posts
function useAllPosts() {
  return useQuery({
    queryKey: ['admin-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, type, media_url, caption, created_at, is_pinned,
          author:profiles!author_id (id, username, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

// Hook for fetching all users
function useAllUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

// Hook for deleting posts as admin
function useAdminDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: role, isLoading: roleLoading } = useUserRole();
  const { data: flags = [], isLoading: flagsLoading } = useContentFlags();
  const { data: reports = [], isLoading: reportsLoading } = useReports();
  const { data: posts = [], isLoading: postsLoading } = useAllPosts();
  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const updateFlag = useUpdateFlag();
  const updateReport = useUpdateReport();
  const deletePost = useAdminDeletePost();
  const { toast } = useToast();

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Shield className="w-8 h-8 text-muted-foreground" />
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  if (!role || (role !== 'admin' && role !== 'moderator')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          >
            <AlertTriangle className="w-16 h-16 text-yellow-500" />
          </motion.div>
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  const pendingFlags = flags.filter(f => f.status === 'pending');
  const pendingReports = reports.filter(r => r.status === 'pending');

  const handleApproveFlag = async (id: string) => {
    if (!profile?.id) return;
    try {
      await updateFlag.mutateAsync({ id, status: 'approved', reviewed_by: profile.id });
      toast({ title: 'Content approved' });
    } catch {
      toast({ title: 'Error', description: 'Failed to approve content', variant: 'destructive' });
    }
  };

  const handleRejectFlag = async (id: string) => {
    if (!profile?.id) return;
    try {
      await updateFlag.mutateAsync({ id, status: 'rejected', reviewed_by: profile.id });
      toast({ title: 'Content rejected' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reject content', variant: 'destructive' });
    }
  };

  const handleDismissReport = async (id: string) => {
    if (!profile?.id) return;
    try {
      await updateReport.mutateAsync({ id, status: 'dismissed', reviewed_by: profile.id });
      toast({ title: 'Report dismissed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to dismiss report', variant: 'destructive' });
    }
  };

  const handleActionReport = async (id: string, notes: string) => {
    if (!profile?.id) return;
    try {
      await updateReport.mutateAsync({ id, status: 'actioned', reviewed_by: profile.id, admin_notes: notes });
      toast({ title: 'Action taken on report' });
    } catch {
      toast({ title: 'Error', description: 'Failed to action report', variant: 'destructive' });
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      await deletePost.mutateAsync(postId);
      toast({ title: 'Post deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete post', variant: 'destructive' });
    }
  };

  const filteredPosts = posts?.filter((p: any) =>
    p.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.author?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredUsers = users?.filter((u: any) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <AppLayout>
      <div className="p-4 max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage content, users, and reports</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flag className="w-5 h-5 text-yellow-500" />
                  AI Flags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pendingFlags.length}</div>
                <p className="text-xs text-muted-foreground">pending review</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-red-500" />
                  Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pendingReports.length}</div>
                <p className="text-xs text-muted-foreground">pending review</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts or users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs defaultValue="flags" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="flags" className="relative">
              <Flag className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Flags</span>
              {pendingFlags.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 justify-center">{pendingFlags.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="relative">
              <MessageSquare className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Reports</span>
              {pendingReports.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 justify-center">{pendingReports.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="posts">
              <FileText className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flags">
            {flagsLoading ? (
              <div className="flex justify-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Shield className="w-8 h-8 text-muted-foreground" />
                </motion.div>
              </div>
            ) : flags.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">No flagged content</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div 
                className="space-y-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {flags.map((flag) => (
                  <FlagCard 
                    key={flag.id} 
                    flag={flag}
                    onApprove={() => handleApproveFlag(flag.id)}
                    onReject={() => handleRejectFlag(flag.id)}
                  />
                ))}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="reports">
            {reportsLoading ? (
              <div className="flex justify-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Shield className="w-8 h-8 text-muted-foreground" />
                </motion.div>
              </div>
            ) : reports.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">No reports to review</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div 
                className="space-y-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {reports.map((report) => (
                  <ReportCard 
                    key={report.id} 
                    report={report}
                    onDismiss={() => handleDismissReport(report.id)}
                    onAction={(notes) => handleActionReport(report.id, notes)}
                  />
                ))}
              </motion.div>
            )}
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts">
            {postsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No posts found</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div className="space-y-3" variants={containerVariants} initial="hidden" animate="visible">
                {filteredPosts.map((post: any) => (
                  <motion.div key={post.id} variants={itemVariants}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <img src={post.media_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={post.author?.avatar_url} />
                                <AvatarFallback>{post.author?.username?.[0]}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{post.author?.username}</span>
                              {post.is_pinned && (
                                <Badge variant="secondary" className="text-xs">
                                  <Pin className="h-3 w-3 mr-1" />Pinned
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{post.caption || 'No caption'}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => navigate(`/p/${post.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeletePost(post.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No users found</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div className="space-y-3" variants={containerVariants} initial="hidden" animate="visible">
                {filteredUsers.map((user: any) => (
                  <motion.div key={user.id} variants={itemVariants}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{user.username}</span>
                              {user.is_verified && <Badge variant="secondary">Verified</Badge>}
                              {user.is_private && <Badge variant="outline">Private</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">{user.display_name || 'No display name'}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/u/${user.username}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
