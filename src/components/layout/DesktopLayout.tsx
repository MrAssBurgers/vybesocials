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

  // Calculate margins based on sidebar states - minimal spacing
  const leftMargin = leftCollapsed ? 'lg:ml-14' : 'lg:ml-[180px] xl:ml-[200px] 2xl:ml-[220px]';
  const rightMargin = hideRightSidebar ? '' : 'xl:mr-[240px] 2xl:mr-[280px]';

  return (
    <div className="min-h-screen w-full">
      {/* Left Sidebar */}
      <DesktopLeftSidebar 
        collapsed={leftCollapsed} 
        onCollapsedChange={setLeftCollapsed}
      />

      {/* Main Content Area */}
      <main 
        className={cn(
          "min-h-screen transition-[margin] duration-200 ease-out",
          leftMargin,
          rightMargin
        )}
      >
        {/* Center content with max-width for ultra-wide */}
        <div 
          className={cn(
            "mx-auto w-full",
            fullWidth ? "" : "max-w-[900px] xl:max-w-[1000px] 2xl:px-6"
          )}
        >
          {children}
        </div>
      </main>

      {/* Right Sidebar */}
      {!hideRightSidebar && <DesktopRightSidebar />}
    </div>
  );
}
