import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '@/hooks/usePlatform';
import { AppLayout } from '@/components/layout/AppLayout';
import { MobileCreateStudio } from '@/components/create/MobileCreateStudio';
import { DesktopCreateStudio } from '@/components/create/DesktopCreateStudio';

export default function UploadPage() {
  const { isDesktop } = useBreakpoint();
  const navigate = useNavigate();

  // Suppress custom wallpaper on upload page for better contrast
  useEffect(() => {
    const hadCustomBg = document.body.classList.contains('has-custom-bg');
    document.body.classList.remove('has-custom-bg');
    return () => {
      if (hadCustomBg) document.body.classList.add('has-custom-bg');
    };
  }, []);

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
