'use client';

import type { Participant } from 'livekit-client';
import { Icon } from '@/components/Icon';
import { Ticks } from '@/components/Ticks';
import { ParticipantAvatar } from '@/components/ParticipantAvatar';
import { RoleBadge } from './RoleBadge';
import {
  ROLE_LABEL,
  normalizeRole,
  roleRank,
  type BanRow,
  type LogRow,
  type MemberRow,
} from '@/lib/types';

const LOG_LABEL: Record<string, string> = {
  kick: 'Wyrzucenie z rozmowy',
  ban: 'Blokada',
  unban: 'Zdjęcie blokady',
  remove_member: 'Usunięcie z pokoju',
  role_change: 'Zmiana roli',
  mute_audio: 'Wyciszenie mikrofonu',
  mute_video: 'Wyłączenie kamery',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pl-PL');
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

export function MembersPanel({
  onlineMembers,
  offlineMembers,
  participants,
  bans,
  logs,
  currentUserId,
  myRank,
  resolvedAvatars,
  panelError,
  panelNotice,
  moderationBusy,
  addUsername,
  onAddUsernameChange,
  onAddMember,
  onToggleMod,
  onMuteAudio,
  onMuteVideo,
  onKick,
  onRemoveMember,
  onBan,
  onUnban,
}: {
  onlineMembers: MemberRow[];
  offlineMembers: MemberRow[];
  participants: Participant[];
  bans: BanRow[];
  logs: LogRow[];
  currentUserId?: string;
  myRank: number;
  resolvedAvatars: Record<string, string | null>;
  panelError: string;
  panelNotice: string;
  moderationBusy: boolean;
  addUsername: string;
  onAddUsernameChange: (val: string) => void;
  onAddMember: (e: React.FormEvent) => void;
  onToggleMod: (m: MemberRow) => void;
  onMuteAudio: (m: MemberRow) => void;
  onMuteVideo: (m: MemberRow) => void;
  onKick: (m: MemberRow) => void;
  onRemoveMember: (m: MemberRow) => void;
  onBan: (m: MemberRow) => void;
  onUnban: (b: BanRow) => void;
}) {
  const renderMember = (m: MemberRow, online: boolean) => {
    const p = participants.find((x) => x.identity === m.user_id);
    const isMe = m.user_id === currentUserId;
    const lower = roleRank(m.role) < myRank;
    const canModerate = myRank >= 2 && lower && !isMe;
    const canToggleMod = myRank >= 3 && m.role !== 'owner' && !isMe;

    return (
      <li key={m.user_id} className="py-2.5">
        <div className="flex items-center gap-3">
          <ParticipantAvatar
            name={m.username}
            url={m.avatar_url ?? resolvedAvatars[m.user_id]}
            speaking={!!p?.isSpeaking}
            className="size-9 shrink-0"
            textClass="text-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-paper">
              {m.username} {isMe && <span className="text-xs font-normal text-mute">(Ty)</span>}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <RoleBadge role={m.role} />
              {!online && <span className="text-[11px] text-mute">od {fmtDate(m.joined_at)}</span>}
            </div>
          </div>
          {p?.isSpeaking && <Ticks active className="size-5 shrink-0 text-lime" />}
          {online && (
            <Icon
              name={p?.isMicrophoneEnabled ? 'mic' : 'micOff'}
              className={`size-4 shrink-0 ${p?.isMicrophoneEnabled ? 'text-mute' : 'text-danger'}`}
            />
          )}
        </div>
        {(canModerate || canToggleMod) && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
            {canToggleMod && (
              <button
                onClick={() => onToggleMod(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                {m.role === 'moderator' ? 'Odbierz moderatora' : 'Mianuj moderatorem'}
              </button>
            )}
            {canModerate && online && p?.isMicrophoneEnabled && (
              <button
                onClick={() => onMuteAudio(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Wycisz mikrofon
              </button>
            )}
            {canModerate && online && p?.isCameraEnabled && (
              <button
                onClick={() => onMuteVideo(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Wyłącz kamerę
              </button>
            )}
            {canModerate && online && (
              <button
                onClick={() => onKick(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Wyrzuć z rozmowy
              </button>
            )}
            {canModerate && (
              <button
                onClick={() => onRemoveMember(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Usuń z pokoju
              </button>
            )}
            {canModerate && (
              <button
                onClick={() => onBan(m)}
                disabled={moderationBusy}
                className="btn btn-danger min-h-8 px-2.5 text-xs"
              >
                Zablokuj
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      {panelError && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {panelError}
        </div>
      )}
      {panelNotice && (
        <div role="status" className="rounded-md border border-lime/40 bg-lime/10 p-3 text-sm text-lime">
          {panelNotice}
        </div>
      )}

      {myRank >= 2 && (
        <form onSubmit={onAddMember} className="flex gap-2">
          <input
            type="text"
            value={addUsername}
            onChange={(e) => onAddUsernameChange(e.target.value)}
            placeholder="Dodaj po nazwie użytkownika"
            aria-label="Nazwa użytkownika do dodania"
            autoComplete="off"
            className="field min-h-10"
          />
          <button
            type="submit"
            disabled={moderationBusy || !addUsername.trim()}
            className="btn btn-primary size-10 min-h-0 shrink-0 px-0"
            aria-label="Dodaj użytkownika"
          >
            <Icon name="plus" className="size-5" />
          </button>
        </form>
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold text-mute">
          W rozmowie ({onlineMembers.length})
        </h3>
        <ul className="divide-y divide-line/40">
          {onlineMembers.map((m) => renderMember(m, true))}
        </ul>
      </div>

      {offlineMembers.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-mute">
            Pozostali członkowie ({offlineMembers.length})
          </h3>
          <ul className="divide-y divide-line/40">
            {offlineMembers.map((m) => renderMember(m, false))}
          </ul>
        </div>
      )}

      {myRank >= 2 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-mute">Zablokowani ({bans.length})</h3>
          {bans.length === 0 ? (
            <p className="text-xs text-mute">Nikt nie jest zablokowany.</p>
          ) : (
            <ul className="divide-y divide-line/40">
              {bans.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-paper">{b.username}</p>
                    <p className="text-[11px] text-mute">
                      {fmtDate(b.banned_at)}
                      {b.banned_by_name ? `, przez ${b.banned_by_name}` : ''}
                      {b.reason ? `: ${b.reason}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => onUnban(b)}
                    disabled={moderationBusy}
                    className="btn btn-ghost min-h-8 px-2.5 text-xs"
                  >
                    Odblokuj
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {myRank >= 2 && logs.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-mute">Ostatnie działania moderacji</h3>
          <ul className="divide-y divide-line/40">
            {logs.map((log) => {
              const roleText =
                log.action_type === 'role_change'
                  ? ` (${ROLE_LABEL[normalizeRole(log.reason) ?? 'member']})`
                  : '';
              return (
                <li key={log.id} className="py-2">
                  <p className="text-sm text-paper">
                    {LOG_LABEL[log.action_type] ?? log.action_type}: {log.target_name}
                    {roleText}
                  </p>
                  <p className="text-[11px] text-mute">
                    {fmtDateTime(log.created_at)}, {log.moderator_name}
                    {log.action_type === 'ban' && log.reason ? `, powód: ${log.reason}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
