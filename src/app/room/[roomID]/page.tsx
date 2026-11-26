'use client';

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  VideoTrack,
  useParticipants,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, VideoPresets, type RoomOptions } from 'livekit-client';
import { supabase } from '@/lib/supabaseClient';
import {
  getErrorMessage,
  normalizeRole,
  roleRank,
  type BanRow,
  type ChatMessage,
  type LogRow,
  type MemberRow,
  type ProfileSummary,
  type RoomInfo,
  type RoomRole,
} from '@/lib/types';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { Ticks } from '@/components/Ticks';
import { FullScreenLoader } from '@/components/Spinner';
import { ParticipantAvatar } from '@/components/ParticipantAvatar';
import { RoleBadge } from '@/components/room/RoleBadge';
import { ChatPanel } from '@/components/room/ChatPanel';
import { MembersPanel } from '@/components/room/MembersPanel';
import { StatsPanel } from '@/components/room/StatsPanel';
import { useWebRTCStats } from '@/hooks/useWebRTCStats';

const SCREEN_PRESETS = {
  '1080p60': {
    capture: { width: 1920, height: 1080, frameRate: 60 },
    encoding: { maxBitrate: 8_000_000, maxFramerate: 60 },
    label: '1080p 60 FPS (Zalecane - Płynne)',
  },
  '1080p30': {
    capture: { width: 1920, height: 1080, frameRate: 30 },
    encoding: { maxBitrate: 3_500_000, maxFramerate: 30 },
    label: '1080p 30 FPS',
  },
  '1440p60': {
    capture: { width: 2560, height: 1440, frameRate: 60 },
    encoding: { maxBitrate: 12_000_000, maxFramerate: 60 },
    label: '1440p (2K) 60 FPS',
  },
  '4k30': {
    capture: { width: 3840, height: 2160, frameRate: 30 },
    encoding: { maxBitrate: 15_000_000, maxFramerate: 30 },
    label: '4K 30 FPS (Wysokie obciążenie)',
  },
} as const;

type ScreenQualityKey = keyof typeof SCREEN_PRESETS;

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    simulcast: true,
    screenShareSimulcastLayers: [VideoPresets.h720, VideoPresets.h360],
  },
};

function peopleLabel(n: number) {
  if (n === 1) return '1 osoba';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} osoby`;
  return `${n} osób`;
}

const asRef = (t: unknown) => t as ComponentProps<typeof VideoTrack>['trackRef'];

async function fetchProfiles(ids: string[]): Promise<Record<string, ProfileSummary>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map: Record<string, ProfileSummary> = {};
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', unique);
  (data ?? []).forEach((p) => {
    map[p.id] = { username: p.username || 'Użytkownik', avatar_url: p.avatar_url ?? null };
  });
  return map;
}

type Phase = 'loading' | 'noaccess' | 'banned' | 'error' | 'ready';

function Notice({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 text-center">
      <p className="max-w-sm text-mute">{text}</p>
      {children}
    </div>
  );
}

function inviteErrorText(message?: string) {
  const m = message ?? '';
  if (m.includes('BANNED')) return 'Masz blokadę w tym pokoju.';
  if (m.includes('INVALID_INVITE'))
    return 'Nieprawidłowy kod zaproszenia albo zaproszenia zostały wyłączone.';
  if (m.includes('NOT_AUTHENTICATED')) return 'Sesja wygasła. Zaloguj się ponownie.';
  return 'Nie udało się dołączyć do pokoju.';
}

const subscribeDesktopMedia = (cb: () => void) => {
  const mql = window.matchMedia('(min-width: 768px)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};

const getDesktopMediaSnapshot = () => window.matchMedia('(min-width: 768px)').matches;
const getDesktopMediaServerSnapshot = () => false;

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const roomId = useMemo(() => {
    const paramVal = params?.roomID ?? params?.roomId ?? params?.id ?? params?.slug;
    const rawString =
      typeof paramVal === 'string' ? paramVal : Array.isArray(paramVal) ? paramVal[0] : '';
    return rawString && rawString !== 'undefined' ? decodeURIComponent(rawString) : '';
  }, [params]);

  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [joining, setJoining] = useState(false);

  const fetchInfo = useCallback(async (name: string): Promise<RoomInfo | null> => {
    const { data } = await supabase.rpc('room_info', { p_name: name });
    return (data as RoomInfo) ?? null;
  }, []);

  const loadToken = useCallback(
    async (name: string) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(name)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const data = (await res.json()) as { token?: string; error?: string };
        if (data.token) {
          setToken(data.token);
          setPhase('ready');
        } else {
          setError(data.error || 'Nie udało się dołączyć do pokoju.');
          setPhase('error');
        }
      } catch (err) {
        console.error('Błąd pobierania tokenu:', err);
        setError('Nie udało się połączyć z serwerem.');
        setPhase('error');
      }
    },
    [router]
  );

  const joinWithCode = useCallback(
    async (name: string, inviteCode: string) => {
      const { error: joinError } = await supabase.rpc('join_room', {
        p_name: name,
        p_code: inviteCode,
      });
      if (joinError) return inviteErrorText(joinError.message);
      const fresh = await fetchInfo(name);
      if (!fresh?.exists) return 'Nie udało się dołączyć do pokoju.';
      setInfo(fresh);
      setPhase('loading');
      await loadToken(name);
      return '';
    },
    [fetchInfo, loadToken]
  );

  useEffect(() => {
    if (!roomId) return;

    const init = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }
      setUser(authUser);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', authUser.id)
        .maybeSingle();

      setUsername(profile?.username || authUser.email?.split('@')[0] || 'Użytkownik');

      const current = await fetchInfo(roomId);
      if (current?.exists && current.is_banned) {
        setPhase('banned');
        return;
      }
      if (current?.exists && current.role) {
        setInfo(current);
        await loadToken(roomId);
        return;
      }

      const invite = new URLSearchParams(window.location.search).get('invite');
      if (invite) {
        const message = await joinWithCode(roomId, invite);
        if (!message) return;
        setCodeError(message);
      }

      setPhase('noaccess');
    };

    void init();
  }, [roomId, router, fetchInfo, loadToken, joinWithCode]);

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    setCodeError('');
    const message = await joinWithCode(roomId, code);
    if (message) {
      setCodeError(message);
      setPhase('noaccess');
    }
    setJoining(false);
  };

  if (phase === 'banned') {
    return (
      <Notice text="Masz blokadę w tym pokoju.">
        <button onClick={() => router.push('/dashboard')} className="btn btn-primary">
          Wróć do panelu
        </button>
      </Notice>
    );
  }

  if (phase === 'error') {
    return (
      <Notice text={error}>
        <button onClick={() => router.push('/dashboard')} className="btn btn-primary">
          Wróć do panelu
        </button>
      </Notice>
    );
  }

  if (phase === 'noaccess') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-5xl leading-none tracking-wide">
            Ten pokój jest zamknięty
          </h1>
          <p className="mt-4 leading-relaxed text-mute">
            Nie należysz do tego pokoju albo on nie istnieje. Wejdziesz, jeśli administrator doda
            Cię po nazwie użytkownika albo podasz kod zaproszenia.
          </p>

          <form onSubmit={handleSubmitCode} className="mt-8 space-y-4">
            <div>
              <label htmlFor="invite-code" className="label">
                Kod zaproszenia
              </label>
              <input
                id="invite-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                className="field"
              />
            </div>
            {codeError && (
              <p role="alert" className="text-sm text-danger">
                {codeError}
              </p>
            )}
            <button
              type="submit"
              disabled={joining || !code.trim()}
              className="btn btn-primary min-h-12 w-full"
            >
              {joining ? 'Sprawdzanie...' : 'Wejdź do pokoju'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="btn btn-ghost w-full"
            >
              Wróć do panelu
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase !== 'ready' || !token || !roomId || !info || !user) {
    return <FullScreenLoader text="Łączenie z pokojem..." />;
  }

  return (
    <LiveKitRoom
      video={false}
      audio={false}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      options={ROOM_OPTIONS}
      data-lk-theme="default"
      onError={(err) => {
        console.warn('LiveKit error / brak uprawnień:', err);
      }}
      onDisconnected={() => router.push('/dashboard')}
      className="h-dvh overflow-hidden bg-ink"
    >
      <CustomRoomUI roomId={roomId} roomInfo={info} currentUser={user} username={username} />
    </LiveKitRoom>
  );
}

function CustomRoomUI({
  roomId,
  roomInfo,
  currentUser,
  username,
}: {
  roomId: string;
  roomInfo: RoomInfo;
  currentUser: User;
  username: string;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const isMicOn = localParticipant.isMicrophoneEnabled;
  const isCamOn = localParticipant.isCameraEnabled;
  const isScreenSharing = localParticipant.isScreenShareEnabled;
  const [screenQuality, setScreenQuality] = useState<ScreenQualityKey>('1080p60');

  const isDesktop = useSyncExternalStore(
    subscribeDesktopMedia,
    getDesktopMediaSnapshot,
    getDesktopMediaServerSnapshot
  );
  const [sidePanelOverride, setSidePanelOverride] = useState<boolean | null>(null);
  const showSidePanel = sidePanelOverride ?? isDesktop;
  const [activeSideTab, setActiveSideTab] = useState<'chat' | 'members' | 'stats'>('chat');
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [panelError, setPanelError] = useState('');
  const [panelNotice, setPanelNotice] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [addUsername, setAddUsername] = useState('');

  const webrtcStats = useWebRTCStats(room);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const cards = tracks
    .filter((t) => t.source === Track.Source.Camera)
    .map((cam) => ({
      cam,
      screen: tracks.find(
        (t) =>
          t.source === Track.Source.ScreenShare &&
          t.participant.identity === cam.participant.identity
      ),
    }));

  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [senderUsernames, setSenderUsernames] = useState<Record<string, string>>({});

  const idsKey = JSON.stringify(
    Array.from(
      new Set([currentUser.id, ...participants.map((p) => p.identity)].filter(Boolean))
    ).sort()
  );

  useEffect(() => {
    const ids = JSON.parse(idsKey) as string[];
    if (ids.length === 0) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Błąd zapytania awatarów:', error.message);
          return;
        }
        const avatarMap: Record<string, string> = {};
        const nameMap: Record<string, string> = {};
        (data ?? []).forEach((row) => {
          if (row.avatar_url) avatarMap[row.id] = row.avatar_url;
          if (row.username) nameMap[row.id] = row.username;
        });
        setAvatars((prev) => ({ ...prev, ...avatarMap }));
        setSenderUsernames((prev) => ({ ...prev, ...nameMap }));
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(username, avatar_url)')
      .eq('room_id', roomInfo.id)
      .order('created_at', { ascending: true });

    if (error || !data) return;

    setMessages(data as ChatMessage[]);

    const senderIds = Array.from(
      new Set(data.map((m) => m.sender_id as string).filter(Boolean))
    );

    if (senderIds.length > 0) {
      const profilesMap = await fetchProfiles(senderIds);
      setSenderUsernames((prev) => {
        const next = { ...prev };
        Object.entries(profilesMap).forEach(([id, info]) => {
          next[id] = info.username;
        });
        return next;
      });
      setAvatars((prev) => {
        const next = { ...prev };
        Object.entries(profilesMap).forEach(([id, info]) => {
          if (info.avatar_url) next[id] = info.avatar_url;
        });
        return next;
      });
    }
  }, [roomInfo.id]);

  useEffect(() => {
    let active = true;
    const syncInitial = async () => {
      if (active) await loadMessages();
    };
    void syncInitial();

    const channel = supabase
      .channel(`room-messages:${roomInfo.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomInfo.id}`,
        },
        async (payload) => {
          const inserted = payload.new as ChatMessage;
          const profilesMap = await fetchProfiles([inserted.sender_id]);
          const senderProfile = profilesMap[inserted.sender_id];
          if (senderProfile) {
            setSenderUsernames((prev) => ({
              ...prev,
              [inserted.sender_id]: senderProfile.username,
            }));
            if (senderProfile.avatar_url) {
              setAvatars((prev) => ({
                ...prev,
                [inserted.sender_id]: senderProfile.avatar_url as string,
              }));
            }
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === inserted.id)) return prev;
            return [
              ...prev,
              {
                ...inserted,
                profiles: senderProfile ?? null,
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [roomInfo.id, loadMessages]);

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('user_id, role, joined_at')
      .eq('room_id', roomInfo.id);
    if (error || !data) return;
    const profiles = await fetchProfiles(data.map((m) => m.user_id as string));
    setMembers(
      data.map((m) => ({
        user_id: m.user_id as string,
        role: normalizeRole(m.role as string | null) ?? 'member',
        joined_at: m.joined_at as string,
        username: profiles[m.user_id as string]?.username || 'Użytkownik',
        avatar_url: profiles[m.user_id as string]?.avatar_url ?? null,
      }))
    );
    setSenderUsernames((prev) => {
      const next = { ...prev };
      Object.entries(profiles).forEach(([id, info]) => {
        next[id] = info.username;
      });
      return next;
    });
    setAvatars((prev) => {
      const next = { ...prev };
      Object.entries(profiles).forEach(([id, info]) => {
        if (info.avatar_url) next[id] = info.avatar_url;
      });
      return next;
    });
  }, [roomInfo.id]);

  const roleById = useMemo(() => {
    const map: Record<string, RoomRole> = {};
    members.forEach((m) => {
      map[m.user_id] = m.role;
    });
    return map;
  }, [members]);

  const myRole: RoomRole = roleById[currentUser.id] ?? normalizeRole(roomInfo.role) ?? 'member';
  const myRank = roleRank(myRole);

  useEffect(() => {
    let active = true;
    const syncInitial = async () => {
      if (active) await loadMembers();
    };
    void syncInitial();

    const channel = supabase
      .channel(`room-members:${roomInfo.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomInfo.id}`,
        },
        () => {
          void loadMembers();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [roomInfo.id, loadMembers, idsKey]);

  const loadModeration = useCallback(async () => {
    const [{ data: banData }, { data: logData }] = await Promise.all([
      supabase
        .from('room_bans')
        .select('id, user_id, reason, banned_at, banned_by')
        .eq('room_id', roomInfo.id)
        .order('banned_at', { ascending: false }),
      supabase
        .from('moderation_logs')
        .select('id, moderator_id, target_user_id, action_type, reason, created_at')
        .eq('room_id', roomInfo.id)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    const ids = [
      ...(banData ?? []).flatMap((b) => [b.user_id as string, b.banned_by as string]),
      ...(logData ?? []).flatMap((l) => [l.moderator_id as string, l.target_user_id as string]),
    ];
    const profiles = await fetchProfiles(ids);
    setBans(
      (banData ?? []).map((b) => ({
        id: b.id as string,
        user_id: b.user_id as string,
        username: profiles[b.user_id as string]?.username || 'Użytkownik',
        reason: (b.reason as string | null) ?? null,
        banned_at: b.banned_at as string,
        banned_by_name: profiles[b.banned_by as string]?.username ?? null,
      }))
    );
    setLogs(
      (logData ?? []).map((l) => ({
        id: l.id as string,
        action_type: String(l.action_type),
        reason: (l.reason as string | null) ?? null,
        created_at: l.created_at as string,
        moderator_name: profiles[l.moderator_id as string]?.username || 'Użytkownik',
        target_name: profiles[l.target_user_id as string]?.username || 'Użytkownik',
      }))
    );
  }, [roomInfo.id]);

  useEffect(() => {
    if (myRank < 2 || !showSidePanel || activeSideTab !== 'members') return;
    let active = true;
    const syncInitial = async () => {
      if (active) await loadModeration();
    };
    void syncInitial();

    const channel = supabase
      .channel(`room-moderation:${roomInfo.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_bans',
          filter: `room_id=eq.${roomInfo.id}`,
        },
        () => {
          void loadModeration();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moderation_logs',
          filter: `room_id=eq.${roomInfo.id}`,
        },
        () => {
          void loadModeration();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [myRank, showSidePanel, activeSideTab, roomInfo.id, loadModeration]);

  const resolvedUsernames = useMemo(() => {
    const map: Record<string, string> = { ...senderUsernames };
    members.forEach((m) => {
      if (m.username) map[m.user_id] = m.username;
    });
    participants.forEach((p) => {
      if (p.name && !map[p.identity]) {
        map[p.identity] = p.name;
      }
    });
    if (currentUser.id && username) {
      map[currentUser.id] = username;
    }
    return map;
  }, [senderUsernames, members, participants, currentUser.id, username]);

  const resolvedAvatars = useMemo(() => {
    const map: Record<string, string | null> = { ...avatars };
    members.forEach((m) => {
      if (m.avatar_url) map[m.user_id] = m.avatar_url;
    });
    return map;
  }, [avatars, members]);

  const mentionableUsers = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; username: string; avatar_url: string | null }[] = [];

    members.forEach((m) => {
      if (!seen.has(m.user_id) && m.username) {
        seen.add(m.user_id);
        list.push({
          id: m.user_id,
          username: m.username,
          avatar_url: m.avatar_url ?? resolvedAvatars[m.user_id] ?? null,
        });
      }
    });

    participants.forEach((p) => {
      const name = p.name || resolvedUsernames[p.identity];
      if (!seen.has(p.identity) && name) {
        seen.add(p.identity);
        list.push({
          id: p.identity,
          username: name,
          avatar_url: resolvedAvatars[p.identity] ?? null,
        });
      }
    });

    return list.sort((a, b) => a.username.localeCompare(b.username));
  }, [members, participants, resolvedUsernames, resolvedAvatars]);

  const handleSendMessage = async (content: string) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          room_id: roomInfo.id,
          sender_id: currentUser.id,
          content,
        },
      ])
      .select('*, profiles:sender_id(username, avatar_url)')
      .single();

    if (error) {
      console.error('Błąd zapisu wiadomości w Supabase:', error);
      alert(`Błąd wysyłania wiadomości: ${error.message}`);
      return false;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data as ChatMessage];
      });
    }
    return true;
  };

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicOn);
  };

  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!isCamOn);
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      const selected = SCREEN_PRESETS[screenQuality];
      const publication = await localParticipant.setScreenShareEnabled(
        true,
        {
          audio: true,
          resolution: selected.capture,
        },
        {
          screenShareEncoding: selected.encoding,
          simulcast: true,
        }
      );
      if (publication?.track?.mediaStreamTrack) {
        const track = publication.track.mediaStreamTrack;
        if ('contentHint' in track) {
          track.contentHint = 'motion';
        }
      }
    } else {
      await localParticipant.setScreenShareEnabled(false);
    }
  };

  const handleLeaveRoom = async () => {
    await room.disconnect();
    router.push('/dashboard');
  };

  const handleCopyInvite = async () => {
    setPanelError('');
    setPanelNotice('');
    const { data } = await supabase
      .from('rooms')
      .select('access_code')
      .eq('id', roomInfo.id)
      .maybeSingle();
    const inviteCode = data?.access_code as string | null | undefined;
    if (!inviteCode) {
      setSidePanelOverride(true);
      setActiveSideTab('members');
      setPanelNotice(
        'Kod zaproszenia nie jest ustawiony. Ustaw go w panelu pokoju albo dodaj osoby po nazwie użytkownika.'
      );
      return;
    }
    const inviteLink = `${window.location.origin}/room/${roomInfo.name}?invite=${encodeURIComponent(inviteCode)}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Skopiuj link zaproszenia:', inviteLink);
    }
  };

  const logAction = async (action: string, targetId: string, reason?: string | null) => {
    await supabase.from('moderation_logs').insert({
      room_id: roomInfo.id,
      moderator_id: currentUser.id,
      target_user_id: targetId,
      action_type: action,
      reason: reason ?? null,
    });
  };

  const roomAdminAction = async (
    userId: string,
    action: 'kick' | 'mute_audio' | 'mute_video'
  ) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await fetch('/api/room-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ room: roomInfo.name, userId, action }),
      });
    } catch {}
  };

  const kickFromCall = (userId: string) => roomAdminAction(userId, 'kick');

  const runModeration = async (action: () => Promise<void>, okText: string) => {
    setPanelError('');
    setPanelNotice('');
    setModerationBusy(true);
    try {
      await action();
      setPanelNotice(okText);
    } catch (err: unknown) {
      setPanelError(getErrorMessage(err, 'Nie udało się wykonać operacji.'));
    } finally {
      setModerationBusy(false);
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const target = addUsername.trim();
    if (!target) return;
    void runModeration(async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', target)
        .maybeSingle();
      if (!profile) throw new Error(`Nie ma użytkownika o nazwie "${target}".`);
      if (members.some((m) => m.user_id === profile.id)) {
        throw new Error(`${target} już jest w tym pokoju.`);
      }
      const { error } = await supabase.from('room_members').insert({
        room_id: roomInfo.id,
        user_id: profile.id,
        role: 'member',
        granted_by: currentUser.id,
      });
      if (error) throw error;
      setAddUsername('');
      await loadMembers();
    }, `Dodano użytkownika ${target}.`);
  };

  const handleToggleMod = (m: MemberRow) => {
    const nextRole = m.role === 'moderator' ? 'member' : 'moderator';
    void runModeration(
      async () => {
        const { error } = await supabase
          .from('room_members')
          .update({ role: nextRole, granted_by: currentUser.id })
          .eq('room_id', roomInfo.id)
          .eq('user_id', m.user_id);
        if (error) throw error;
        await logAction('role_change', m.user_id, nextRole);
        await loadMembers();
        await loadModeration();
      },
      nextRole === 'moderator'
        ? `${m.username} jest teraz moderatorem.`
        : `${m.username} nie jest już moderatorem.`
    );
  };

  const handleMuteAudio = (m: MemberRow) => {
    void runModeration(async () => {
      await roomAdminAction(m.user_id, 'mute_audio');
      try {
        await logAction('mute_audio', m.user_id);
        await loadModeration();
      } catch {}
    }, `Wyciszono mikrofon użytkownika ${m.username}.`);
  };

  const handleMuteVideo = (m: MemberRow) => {
    void runModeration(async () => {
      await roomAdminAction(m.user_id, 'mute_video');
      try {
        await logAction('mute_video', m.user_id);
        await loadModeration();
      } catch {}
    }, `Wyłączono kamerę użytkownika ${m.username}.`);
  };

  const handleKick = (m: MemberRow) => {
    void runModeration(async () => {
      await kickFromCall(m.user_id);
      await logAction('kick', m.user_id);
      await loadModeration();
    }, `${m.username} został rozłączony z rozmowy.`);
  };

  const handleRemoveMember = (m: MemberRow) => {
    if (
      !window.confirm(
        `Usunąć ${m.username} z pokoju? Żeby wrócić, będzie musiał zostać dodany albo użyć kodu.`
      )
    )
      return;
    void runModeration(async () => {
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomInfo.id)
        .eq('user_id', m.user_id);
      if (error) throw error;
      await logAction('remove_member', m.user_id);
      await kickFromCall(m.user_id);
      await loadMembers();
      await loadModeration();
    }, `${m.username} został usunięty z pokoju.`);
  };

  const handleBan = (m: MemberRow) => {
    const reason = window.prompt(`Powód blokady ${m.username} (opcjonalnie):`);
    if (reason === null) return;
    void runModeration(async () => {
      const { error: banError } = await supabase.from('room_bans').insert({
        room_id: roomInfo.id,
        user_id: m.user_id,
        banned_by: currentUser.id,
        reason: reason.trim() || null,
      });
      if (banError) throw banError;
      await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomInfo.id)
        .eq('user_id', m.user_id);
      await logAction('ban', m.user_id, reason.trim() || null);
      await kickFromCall(m.user_id);
      await loadMembers();
      await loadModeration();
    }, `${m.username} został zablokowany.`);
  };

  const handleUnban = (b: BanRow) => {
    void runModeration(async () => {
      const { error } = await supabase.from('room_bans').delete().eq('id', b.id);
      if (error) throw error;
      await logAction('unban', b.user_id);
      await loadModeration();
    }, `Zdjęto blokadę: ${b.username}. Żeby wrócić, musi zostać dodany lub użyć kodu.`);
  };

  const onlineIds = new Set(participants.map((p) => p.identity));
  const sortedMembers = [...members].sort(
    (a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username)
  );
  const onlineMembers = sortedMembers.filter((m) => onlineIds.has(m.user_id));
  const offlineMembers = sortedMembers.filter((m) => !onlineIds.has(m.user_id));

  const getGridLayoutClass = (count: number) => {
    if (count === 1) return 'grid-cols-1 grid-rows-1 max-w-5xl max-h-[85vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-1 max-w-7xl max-h-[85vh]';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 max-w-6xl max-h-[85vh]';
    return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-fr max-w-7xl';
  };

  const ctrl = 'flex size-12 items-center justify-center rounded-full border transition-colors';
  const ctrlOff = 'border-line bg-raised text-paper hover:border-mute';
  const ctrlOn = 'border-lime bg-lime text-ink';
  const ctrlMuted = 'border-danger/50 bg-danger/10 text-danger';

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-ink text-paper">
      <RoomAudioRenderer />

      <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Brand compact href="/dashboard" />
          <h1 className="font-display truncate text-2xl leading-none tracking-wide">{roomId}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              setSidePanelOverride(true);
              setActiveSideTab('members');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3"
            aria-label="Lista osób w pokoju"
          >
            <Icon name="users" className="size-4 text-mute" />
            <span>{peopleLabel(participants.length)}</span>
          </button>

          <button
            onClick={() => {
              setSidePanelOverride(true);
              setActiveSideTab('stats');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3 font-mono text-xs"
            aria-label="Statystyki WebRTC"
          >
            <Icon name="stats" className="size-4 text-lime" />
            <span className="hidden sm:inline">Statystyki</span>
          </button>

          {myRank >= 3 && (
            <button
              onClick={handleCopyInvite}
              className="btn btn-ghost min-h-10 px-3"
              aria-label="Skopiuj link zaproszenia"
            >
              <Icon name={copied ? 'check' : 'share'} className="size-4" />
              <span className="hidden sm:inline">{copied ? 'Skopiowano' : 'Zaproś'}</span>
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            className="btn btn-danger min-h-10 px-3"
            aria-label="Opuść pokój"
          >
            <Icon name="leave" className="size-4" />
            <span className="hidden sm:inline">Opuść pokój</span>
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <main className="flex flex-1 items-center justify-center overflow-y-auto p-3 sm:p-6">
          <div
            className={`grid h-full w-full items-center justify-items-center gap-3 sm:gap-4 ${getGridLayoutClass(cards.length)}`}
          >
            {cards.map(({ cam, screen }) => {
              const participant = cam.participant;
              const name =
                participant.name ||
                resolvedUsernames[participant.identity] ||
                participant.identity ||
                'Użytkownik';
              const isSpeaking = participant.isSpeaking;
              const camOn = !!cam.publication?.track && !cam.publication.isMuted;
              const avatarUrl = resolvedAvatars[participant.identity];

              return (
                <div
                  key={participant.identity}
                  className={`relative flex aspect-video h-full max-h-[80vh] w-full items-center justify-center overflow-hidden rounded-lg border bg-panel transition-colors ${
                    isSpeaking ? 'border-lime ring-2 ring-lime' : 'border-line'
                  }`}
                >
                  {screen ? (
                    <VideoTrack
                      trackRef={asRef(screen)}
                      className="h-full w-full bg-black object-contain"
                    />
                  ) : camOn ? (
                    <VideoTrack trackRef={asRef(cam)} className="h-full w-full object-cover" />
                  ) : (
                    <ParticipantAvatar
                      name={name}
                      url={avatarUrl}
                      speaking={isSpeaking}
                      className="size-24 sm:size-32"
                      ticksClassName="size-14 sm:size-20"
                      textClass="text-5xl sm:text-6xl"
                    />
                  )}

                  {screen && (
                    <div className="absolute bottom-2.5 right-2.5 flex aspect-video w-[26%] min-w-24 max-w-52 items-center justify-center overflow-hidden rounded-md border border-line bg-raised shadow-lg">
                      {camOn ? (
                        <VideoTrack trackRef={asRef(cam)} className="h-full w-full object-cover" />
                      ) : (
                        <ParticipantAvatar
                          name={name}
                          url={avatarUrl}
                          speaking={isSpeaking}
                          className="size-10"
                          ticksClassName="size-6"
                          textClass="text-2xl"
                        />
                      )}
                    </div>
                  )}

                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-md bg-ink/80 px-2.5 py-1 text-xs font-semibold sm:text-sm">
                    {isSpeaking && <Ticks active className="size-4 text-lime" />}
                    <span>{name}</span>
                    {roleById[participant.identity] && (
                      <RoleBadge role={roleById[participant.identity]} compact />
                    )}
                    {screen && <Icon name="screen" className="size-3.5 text-lime" />}
                    {!participant.isMicrophoneEnabled && (
                      <Icon name="micOff" className="size-3.5 text-danger" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {showSidePanel && (
          <aside className="absolute inset-0 z-30 flex flex-col border-l border-line bg-panel md:static md:z-auto md:w-80 md:shrink-0">
            <div className="flex items-center justify-between border-b border-line p-2.5">
              <div className="flex gap-1 rounded-md bg-raised p-1 text-xs font-semibold">
                <button
                  onClick={() => setActiveSideTab('chat')}
                  className={`rounded px-3 py-1.5 transition ${
                    activeSideTab === 'chat'
                      ? 'bg-panel text-paper shadow-sm'
                      : 'text-mute hover:text-paper'
                  }`}
                >
                  Czat
                </button>
                <button
                  onClick={() => setActiveSideTab('members')}
                  className={`rounded px-3 py-1.5 transition ${
                    activeSideTab === 'members'
                      ? 'bg-panel text-paper shadow-sm'
                      : 'text-mute hover:text-paper'
                  }`}
                >
                  Osoby ({members.length || participants.length})
                </button>
                <button
                  onClick={() => setActiveSideTab('stats')}
                  className={`rounded px-3 py-1.5 transition ${
                    activeSideTab === 'stats'
                      ? 'bg-panel text-paper shadow-sm'
                      : 'text-mute hover:text-paper'
                  }`}
                >
                  Stats
                </button>
              </div>
              <button
                onClick={() => setSidePanelOverride(false)}
                className="btn btn-ghost size-9 min-h-0 px-0 md:hidden"
                aria-label="Zamknij panel"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>

            {activeSideTab === 'chat' && (
              <ChatPanel
                messages={messages}
                currentUserId={currentUser.id}
                username={username}
                resolvedUsernames={resolvedUsernames}
                resolvedAvatars={resolvedAvatars}
                roleById={roleById}
                mentionableUsers={mentionableUsers}
                onSendMessage={handleSendMessage}
              />
            )}

            {activeSideTab === 'members' && (
              <MembersPanel
                onlineMembers={onlineMembers}
                offlineMembers={offlineMembers}
                participants={participants}
                bans={bans}
                logs={logs}
                currentUserId={currentUser.id}
                myRank={myRank}
                resolvedAvatars={resolvedAvatars}
                panelError={panelError}
                panelNotice={panelNotice}
                moderationBusy={moderationBusy}
                addUsername={addUsername}
                onAddUsernameChange={setAddUsername}
                onAddMember={handleAddMember}
                onToggleMod={handleToggleMod}
                onMuteAudio={handleMuteAudio}
                onMuteVideo={handleMuteVideo}
                onKick={handleKick}
                onRemoveMember={handleRemoveMember}
                onBan={handleBan}
                onUnban={handleUnban}
              />
            )}

            {activeSideTab === 'stats' && <StatsPanel stats={webrtcStats} />}
          </aside>
        )}
      </div>

      <footer className="z-20 flex shrink-0 items-center justify-center gap-3 border-t border-line bg-panel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          onClick={toggleMic}
          aria-pressed={isMicOn}
          aria-label={isMicOn ? 'Wycisz mikrofon' : 'Włącz mikrofon'}
          title={isMicOn ? 'Wycisz mikrofon' : 'Włącz mikrofon'}
          className={`${ctrl} ${isMicOn ? ctrlOff : ctrlMuted}`}
        >
          <Icon name={isMicOn ? 'mic' : 'micOff'} />
        </button>

        <button
          onClick={toggleCam}
          aria-pressed={isCamOn}
          aria-label={isCamOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
          title={isCamOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
          className={`${ctrl} ${isCamOn ? ctrlOff : ctrlMuted}`}
        >
          <Icon name="cam" />
        </button>

        <div className="flex items-center rounded-full border border-line bg-raised p-1">
          <button
            onClick={toggleScreenShare}
            aria-pressed={isScreenSharing}
            aria-label={
              isScreenSharing ? 'Zakończ udostępnianie ekranu' : 'Udostępnij ekran'
            }
            title={isScreenSharing ? 'Zakończ udostępnianie ekranu' : 'Udostępnij ekran'}
            className={`flex size-10 items-center justify-center rounded-full transition-colors ${
              isScreenSharing ? 'bg-lime text-ink' : 'text-paper hover:bg-panel'
            }`}
          >
            <Icon name="screen" />
          </button>
          <select
            value={screenQuality}
            onChange={(e) => setScreenQuality(e.target.value as ScreenQualityKey)}
            disabled={isScreenSharing}
            aria-label="Jakość udostępniania ekranu"
            className="cursor-pointer bg-transparent px-2 text-xs font-medium text-paper outline-none disabled:opacity-50"
          >
            {Object.entries(SCREEN_PRESETS).map(([key, item]) => (
              <option key={key} value={key} className="bg-panel text-paper">
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setSidePanelOverride(!showSidePanel);
            setActiveSideTab('chat');
          }}
          aria-pressed={showSidePanel && activeSideTab === 'chat'}
          aria-label="Przełącz czat"
          title="Przełącz czat"
          className={`${ctrl} ${showSidePanel && activeSideTab === 'chat' ? ctrlOn : ctrlOff}`}
        >
          <Icon name="chat" />
        </button>
      </footer>
    </div>
  );
}
