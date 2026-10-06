import { Component, type ErrorInfo, type ReactNode } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';

export class MapErrorBoundary extends Component<{ children: ReactNode; onReload?: () => void }, { hasError: boolean; reloadNeeded: boolean }> {
  state = { hasError: false, reloadNeeded: false };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, reloadNeeded: /Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk.*failed|ChunkLoadError/i.test(error.message) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[VybeMap]', error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
        <MapPin className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-bold">VybeMap couldn&apos;t load</p>
        <button type="button" onClick={() => {
          // Browsers can cache a rejected module fetch beyond React's lazy state.
          // A new document retries app files without deleting account storage.
          if (this.state.reloadNeeded) { (this.props.onReload || (() => window.location.reload()))(); return; }
          this.setState({ hasError: false, reloadNeeded: false });
        }} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <RefreshCw className="inline h-4 w-4 mr-2" />Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}
