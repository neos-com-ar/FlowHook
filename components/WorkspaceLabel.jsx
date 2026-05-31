'use client';

export function WorkspaceColorDot({ color, className = 'w-2.5 h-2.5' }) {
  return (
    <span
      className={`rounded-full flex-shrink-0 ring-1 ring-black/10 ${className}`}
      style={{ backgroundColor: color || '#3B82F6' }}
      aria-hidden
    />
  );
}

export default function WorkspaceLabel({
  workspace,
  showSlug = false,
  nameClassName = 'text-sm font-medium text-gray-900',
  slugClassName = 'text-xs text-gray-400 font-mono',
}) {
  if (!workspace) return null;

  const displaySlug = showSlug && workspace.slug && !workspace.isPersonal;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <WorkspaceColorDot color={workspace.color} />
      <div className="min-w-0">
        <p className={`truncate ${nameClassName}`}>{workspace.name}</p>
        {displaySlug && (
          <p className={`truncate ${slugClassName}`}>{workspace.slug}</p>
        )}
      </div>
    </div>
  );
}
