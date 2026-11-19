import { ROLE_LABEL, type RoomRole } from '@/lib/types';

export function RoleBadge({ role, compact = false }: { role: RoomRole; compact?: boolean }) {
  if (compact && role === 'member') return null;
  const style =
    role === 'owner'
      ? 'bg-lime text-ink'
      : role === 'moderator'
        ? 'border border-lime/60 text-lime'
        : 'border border-line text-mute';
  const text = compact ? (role === 'owner' ? 'Admin' : 'Mod') : ROLE_LABEL[role];
  return (
    <span
      title={ROLE_LABEL[role]}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${style}`}
    >
      {text}
    </span>
  );
}
