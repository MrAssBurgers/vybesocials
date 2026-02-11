import { ReactNode, useState } from 'react';
import { useBreakpoint } from '@/hooks/usePlatform';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { cn } from '@/lib/utils';

interface DesktopLayoutProps {
  children: ReactNode;
  hideRightSidebar?: boolean;
  fullWidth?: boolean;
}

export function DesktopLayout({ children, hideRightSidebar = false, fullWidth = false }: DesktopLayoutProps) {
  const { isDesktop } = useBreakpoint();
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Only render desktop layout on desktop
  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full">
      <div className="flex min-h-screen w-full">
        {/* Left Sidebar */}
        <DesktopLeftSidebar 
          collapsed={leftCollapsed} 
          onCollapsedChange={setLeftCollapsed}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 min-h-screen overflow-x-hidden relative z-[2]">
          <div 
            className={cn(
              "mx-auto w-full px-2 lg:px-3",
              fullWidth ? "" : "max-w-full"
            )}
          >
            {children}
          </div>
        </main>

        {/* Right Sidebar */}
        {!hideRightSidebar && <DesktopRightSidebar />}
      </div>
    </div>
  );
}
