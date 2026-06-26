/**
 * Shared scroll-direction hide/show — delegates to BottomNavController.
 */
export {
  bindBottomNavScrollContainer as bindAppScrollHideContainer,
  subscribeBottomNavScroll as subscribeScrollHide,
  resetBottomNavScrollVisible as resetScrollHideVisible,
  isBottomNavScrollVisible as isScrollHideVisible,
} from '@/lib/bottomNavController';
