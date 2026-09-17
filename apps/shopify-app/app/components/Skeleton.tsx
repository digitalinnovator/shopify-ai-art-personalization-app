const LINE_IDS = ['one', 'two', 'three', 'four', 'five', 'six'] as const;

export function Skeleton({
  width,
  height,
  className,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <div
      className={['skeleton', className ?? ''].filter(Boolean).join(' ')}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const ids = LINE_IDS.slice(0, Math.min(lines, LINE_IDS.length));
  return (
    <div className="stack stack--sm" aria-hidden="true">
      {ids.map((id) => (
        <div
          key={id}
          className="skeleton skeleton--text"
          style={{ width: id === ids[ids.length - 1] ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}
