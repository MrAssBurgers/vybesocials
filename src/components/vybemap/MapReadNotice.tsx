type Props = { loading?: boolean; failed?: boolean; onRetry: () => void; more?: boolean; loadingMore?: boolean; onMore?: () => void; label: string; windowed?: boolean; onRestart?: () => void; nextGroup?: boolean };
export function MapReadNotice({ loading, failed, onRetry, more, loadingMore, onMore, label, windowed, onRestart, nextGroup }: Props) {
  return <div className="text-xs text-muted-foreground py-2">
    {failed ? <div role="alert">{label} could not load. <button type="button" className="text-primary underline ml-1" onClick={onRetry}>Retry {label.toLowerCase()}</button></div> : loading ? <p role="status">Loading {label.toLowerCase()}…</p> : null}
    {more && !failed && <button type="button" disabled={loadingMore} className="text-primary underline py-2" onClick={onMore}>{loadingMore ? 'Loading…' : nextGroup ? `Next group of ${label.toLowerCase()}` : `Load more ${label.toLowerCase()}`}</button>}
    {windowed && <div>Showing a later group. <button type="button" className="text-primary underline py-2" onClick={onRestart}>Back to first results</button></div>}
  </div>;
}
