export function InboxCategoryCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="dm-inbox-category-count" aria-label={`${count}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
