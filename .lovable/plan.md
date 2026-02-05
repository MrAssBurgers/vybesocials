
# Fix Screenshot Detection When Leaving Tab in Chat

## Problem
The current screenshot detection in `useScreenCapture.ts` uses timing-based heuristics (blur/focus duration, visibility change duration) to detect screenshots. This approach fails when users leave the tab because:

1. The detection requires both blur AND visibility signals to occur within tight timing windows (50-800ms visibility, 100-1000ms blur)
2. When switching tabs, these timings are often longer than the detection thresholds
3. No detection of keyboard shortcuts (PrintScreen, Cmd+Shift on Mac)
4. The `isActivelyViewingChat` flag isn't being updated properly when navigating

## Solution
Improve screenshot detection with multiple approaches:

### 1. Add Keyboard Shortcut Detection
Listen for common screenshot keyboard shortcuts:
- Windows: PrintScreen, Alt+PrintScreen, Win+Shift+S
- Mac: Cmd+Shift+3 (full screen), Cmd+Shift+4 (selection), Cmd+Shift+5 (screenshot menu)

### 2. Relax Timing Constraints
- Increase visibility change threshold from 50-800ms to 50-2000ms
- Increase blur duration threshold from 100-1000ms to 100-2000ms
- This captures more tab-switch scenarios where users screenshot and return

### 3. Single-Signal Detection
- Trigger on EITHER visibility OR blur signal with medium confidence (not just when combined)
- Keep high confidence for combined signals

### 4. Update Chat Active State
- Ensure `setActivelyViewingChat(true)` is called when entering a chat
- Ensure `setActivelyViewingChat(false)` is called when leaving

## Files to Modify

**src/hooks/useScreenCapture.ts**
- Add keyboard event listener for screenshot shortcuts
- Relax timing thresholds for visibility/blur detection
- Add single-signal detection with medium confidence
- Improve detection logic to handle tab switches better

**src/components/chat/ChatView.tsx**
- Call `setActivelyViewingChat(true)` when chat mounts
- Call `setActivelyViewingChat(false)` when chat unmounts or navigates away

## Technical Details

### Keyboard Shortcut Detection
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Windows PrintScreen
  if (e.key === 'PrintScreen') {
    triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
    return;
  }
  
  // Mac screenshot shortcuts: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
  if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
    triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
    return;
  }
  
  // Windows Snipping Tool: Win+Shift+S
  if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
    triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
  }
};
```

### Relaxed Timing Thresholds
```typescript
// Before: 50-800ms visibility, 100-1000ms blur
// After: 50-2000ms visibility, 100-3000ms blur

// Visibility change detection
if (hiddenDuration > 50 && hiddenDuration < 2000) {
  // ...trigger with medium confidence for single signal
}

// Blur/focus detection  
if (blurDuration > 100 && blurDuration < 3000) {
  // ...trigger with medium confidence for single signal
}

// Combined signals = high confidence
if (blurWasRecent && visibilityWasRecent) {
  // ...trigger with high confidence
}
```

### Chat Active State Management
```typescript
// In ChatView.tsx
const { setActivelyViewingChat } = useScreenCapture({
  enabled: !!conversationId,
  onCapture: (event) => { /* ... */ }
});

// Set active when chat mounts/changes
useEffect(() => {
  if (conversationId) {
    setActivelyViewingChat(true);
  }
  return () => setActivelyViewingChat(false);
}, [conversationId, setActivelyViewingChat]);
```

## Testing
After implementation:
1. Open a chat conversation
2. Take a screenshot using keyboard shortcut (Cmd+Shift+4 on Mac, PrintScreen on Windows)
3. Verify screenshot alert appears
4. Switch to another tab, take screenshot, return to chat
5. Verify screenshot alert appears
6. Switch tabs normally (without screenshot) - should NOT trigger false positive
