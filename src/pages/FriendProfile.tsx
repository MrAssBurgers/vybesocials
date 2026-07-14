import { Navigate, useParams } from 'react-router-dom';
import { publicProfilePath } from '@/lib/friendProfileRoutes';

export default function FriendProfilePage() {
  const { username } = useParams<{ username: string }>();
  return <Navigate to={username ? publicProfilePath(username) : '/'} replace />;
}
