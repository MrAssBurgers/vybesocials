import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '@/hooks/usePlatform';
import { AppLayout } from '@/components/layout/AppLayout';
import { MobileCreateStudio } from '@/components/create/MobileCreateStudio';
import { DesktopCreateStudio } from '@/components/create/DesktopCreateStudio';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { toast } from 'sonner';

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

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/home', { replace: true });
    }
  };

  const handleCameraError = () => {
    toast.error('Camera unavailable — try again');
    handleClose();
  };

  // Mobile/Tablet: Full-screen camera-first experience
  if (!isDesktop) {
    return (
      <CameraMountBoundary surface="upload-mobile" onError={handleCameraError}>
        <MobileCreateStudio onClose={handleClose} />
      </CameraMountBoundary>
    );
  }

  // Desktop: Studio layout with sidebars
  return (
    <AppLayout hideNav noPadding hideRightSidebar fullWidth>
      <CameraMountBoundary surface="upload-desktop" onError={handleCameraError}>
        <DesktopCreateStudio onClose={handleClose} />
      </CameraMountBoundary>
    </AppLayout>
  );
}

