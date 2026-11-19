'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Icon } from '@/components/Icon';
import { ParticipantAvatar } from '@/components/ParticipantAvatar';
import { RoleBadge } from './RoleBadge';
import type { ChatMessage, RoomRole } from '@/lib/types';

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatChatTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return time;

  const day = date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return `${day}, ${time}`;
}

export interface MentionableUser {
  id: string;
  username: string;
  avatar_url: string | null;
}

export function ChatPanel({
  messages,
  currentUserId,
  username,
  resolvedUsernames,
  resolvedAvatars,
  roleById,
  mentionableUsers,
  onSendMessage,
}: {
  messages: ChatMessage[];
  currentUserId?: string;
  username: string;
  resolvedUsernames: Record<string, string>;
  resolvedAvatars: Record<string, string | null>;
  roleById: Record<string, RoomRole>;
  mentionableUsers: MentionableUser[];
  onSendMessage: (content: string) => Promise<boolean>;
}) {
  const [newMessage, setNewMessage] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers.filter((u) => u.username.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, mentionableUsers]);

  const mentionPattern = useMemo(() => {
    const names = Array.from(
      new Set(Object.values(resolvedUsernames).filter((n) => n && n.trim().length > 0))
    ).sort((a, b) => b.length - a.length);

    if (names.length === 0) return null;
    const escaped = names.map(escapeRegExp).join('|');
    return `(^|\\s)(@(?:${escaped}))(?=$|\\s|[.,!?;:])`;
  }, [resolvedUsernames]);

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);

    const cursor = e.target.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (targetUsername: string) => {
    const input = chatInputRef.current;
    const cursor = input?.selectionStart ?? newMessage.length;
    const beforeCursor = newMessage.slice(0, cursor);
    const afterCursor = newMessage.slice(cursor);

    const replacedBefore = beforeCursor.replace(/(^|\s)@([^\s@]*)$/, `$1@${targetUsername} `);
    const updated = replacedBefore + afterCursor;
    setNewMessage(updated);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(replacedBefore.length, replacedBefore.length);
      }
    });
  };

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery === null || mentionSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const chosen = mentionSuggestions[mentionIndex] ?? mentionSuggestions[0];
      if (chosen) insertMention(chosen.username);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMentionQuery(null);
    }
  };

  const isCurrentUserMentioned = useCallback(
    (content: string) => {
      const myName = ((currentUserId && resolvedUsernames[currentUserId]) || username || '').trim();
      if (!myName) return false;
      const re = new RegExp(`(^|\\s)@${escapeRegExp(myName)}(?=$|\\s|[.,!?;:])`, 'i');
      return re.test(content);
    },
    [resolvedUsernames, currentUserId, username]
  );

  const renderMessageContent = (content: string, isMine: boolean) => {
    if (!mentionPattern) return content;

    const regex = new RegExp(mentionPattern, 'gi');
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const leadingSpace = match[1];
      const mentionToken = match[2];
      const start = match.index;

      if (start > lastIndex) {
        parts.push(content.slice(lastIndex, start));
      }
      if (leadingSpace) {
        parts.push(leadingSpace);
      }

      parts.push(
        <span
          key={`${start}-${mentionToken}`}
          className={`rounded px-1 py-0.5 font-semibold ${
            isMine ? 'bg-ink/15 text-ink' : 'bg-lime/15 text-lime'
          }`}
        >
          {mentionToken}
        </span>
      );

      lastIndex = start + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content) return;
    setNewMessage('');
    setMentionQuery(null);
    const ok = await onSendMessage(content);
    if (!ok) {
      setNewMessage(content);
    }
  };

  return (
    <>
      <div ref={chatScrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-mute">
            Nikt jeszcze nic nie napisał. Zacznij pierwszy.
          </p>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === currentUserId;
            const joinedProfile = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
            const senderName =
              joinedProfile?.username ||
              resolvedUsernames[msg.sender_id] ||
              (mine ? username : 'Użytkownik');
            const senderAvatar =
              joinedProfile?.avatar_url ?? resolvedAvatars[msg.sender_id] ?? null;
            const mentionsMe = !mine && isCurrentUserMentioned(msg.content);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 rounded-lg px-1.5 py-1 transition-colors ${
                  mine ? 'flex-row-reverse' : 'flex-row'
                } ${mentionsMe ? 'border-l-2 border-lime bg-lime/[0.06]' : ''}`}
              >
                <ParticipantAvatar
                  name={senderName}
                  url={senderAvatar}
                  className="mt-0.5 size-7 shrink-0"
                  textClass="text-xs"
                />

                <div className={`flex min-w-0 flex-1 flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`mb-1 flex flex-wrap items-baseline gap-1.5 text-xs text-mute ${
                      mine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="font-semibold text-paper">
                      {senderName}
                      {mine && <span className="ml-1 font-normal text-mute">(Ty)</span>}
                    </span>
                    {roleById[msg.sender_id] && (
                      <RoleBadge role={roleById[msg.sender_id]} compact />
                    )}
                    <time dateTime={msg.created_at}>{formatChatTimestamp(msg.created_at)}</time>
                  </div>
                  <p
                    className={`max-w-[90%] wrap-break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      mine
                        ? 'bg-lime text-ink'
                        : mentionsMe
                          ? 'border border-lime/25 bg-raised text-paper'
                          : 'bg-raised text-paper'
                    }`}
                  >
                    {renderMessageContent(msg.content, mine)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="relative border-t border-line p-3">
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Oznacz użytkownika"
            className="absolute bottom-full left-3 right-3 mb-1.5 overflow-hidden rounded-lg border border-line bg-raised shadow-xl"
          >
            {mentionSuggestions.map((u, idx) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={idx === mentionIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u.username);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                  idx === mentionIndex
                    ? 'bg-lime/15 text-paper'
                    : 'text-mute hover:bg-panel hover:text-paper'
                }`}
              >
                <ParticipantAvatar
                  name={u.username}
                  url={u.avatar_url}
                  className="size-5 shrink-0"
                  textClass="text-[10px]"
                />
                <span className="truncate font-medium text-paper">@{u.username}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={newMessage}
            onChange={handleChatInputChange}
            onKeyDown={handleChatInputKeyDown}
            placeholder="Napisz wiadomość... (@nick)"
            aria-label="Treść wiadomości"
            autoComplete="off"
            className="field"
          />
          <button
            type="submit"
            className="btn btn-primary size-11 shrink-0 px-0"
            aria-label="Wyślij wiadomość"
          >
            <Icon name="send" className="size-5" />
          </button>
        </form>
      </div>
    </>
  );
}
