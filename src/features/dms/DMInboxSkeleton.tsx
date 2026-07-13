export function DMInboxSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="dm-inbox-skeleton-list" aria-busy="true" aria-label="Loading chats">
      {Array.from({ length: count }, (_, index) => (
        <div className="dm-inbox-skeleton-row" key={index}>
          <div className="dm-inbox-skeleton-avatar" />
          <div className="dm-inbox-skeleton-copy">
            <div className="dm-inbox-skeleton-line dm-inbox-skeleton-line--name" />
            <div className="dm-inbox-skeleton-line dm-inbox-skeleton-line--status" />
            <div className="dm-inbox-skeleton-line dm-inbox-skeleton-line--preview" />
          </div>
          <div className="dm-inbox-skeleton-camera" />
        </div>
      ))}
    </div>
  );
}
