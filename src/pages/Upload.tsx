import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '@/hooks/usePlatform';
import { AppLayout } from '@/components/layout/AppLayout';
import { MobileCreateStudio } from '@/components/create/MobileCreateStudio';
import { DesktopCreateStudio } from '@/components/create/DesktopCreateStudio';

export default function UploadPage() {
  const { isDesktop } = useBreakpoint();
  const navigate = useNavigate();

  const handleClose = () => navigate(-1);

  // Mobile/Tablet: Full-screen camera-first experience
  if (!isDesktop) {
    return <MobileCreateStudio onClose={handleClose} />;
  }

  // Desktop: Studio layout with sidebars
  return (
    <AppLayout hideNav noPadding hideRightSidebar fullWidth>
      <DesktopCreateStudio onClose={handleClose} />
    </AppLayout>
  );
}
