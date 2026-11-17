'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ComponentProps } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { Ticks } from '@/components/Ticks';
import { FullScreenLoader } from '@/components/Spinner';

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
  };
}

interface WebRTCStats {
  rtt: number | null;
  jitter: number | null;
  packetLossPercent: number | null;
  bitrateInbound: number;
  bitrateOutbound: number;
  resolution: string | null;
  fps: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  transportState: string | null;
}

// maxBitrate to tylko SUFIT: przeglądarka sama obniża faktyczny bitrate,
// gdy łącze nadawcy jest słabe.
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
};

type ScreenQualityKey = keyof typeof SCREEN_PRESETS;

// Opcje pokoju trzymamy poza komponentem, żeby obiekt nie tworzył się przy każdym renderze.
//  - simulcast + screenShareSimulcastLayers: nadawca wysyła obok pełnej jakości
//    słabsze warstwy ekranu, a serwer dobiera każdemu odbiorcy warstwę do jego łącza
//  - adaptiveStream: odbiorca dostaje jakość dopasowaną do rozmiaru kafelka i łącza
//  - dynacast: nadawca nie wysyła warstw, których nikt nie ogląda
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

// ── Role w pokoju ───────────────────────────────────────────
// owner = administrator (założyciel), moderator, member
type RoomRole = 'owner' | 'moderator' | 'member';

const ROLE_LABEL: Record<RoomRole, string> = {
  owner: 'Administrator',
  moderator: 'Moderator',
  member: 'Członek',
};

const normalizeRole = (role?: string | null): RoomRole | null => {
  if (!role) return null;
  if (role === 'owner' || role === 'admin') return 'owner';
  if (role === 'moderator') return 'moderator';
  return 'member';
};

const roleRank = (role?: RoomRole | null) =>
  role === 'owner' ? 3 : role === 'moderator' ? 2 : role === 'member' ? 1 : 0;

/** compact = skrót do kafelków i czatu (zwykłych członków nie oznaczamy) */
function RoleBadge({ role, compact = false }: { role: RoomRole; compact?: boolean }) {
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

interface RoomInfo {
  exists: boolean;
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  role: string | null;
  is_banned: boolean;
}

interface MemberRow {
  user_id: string;
  role: RoomRole;
  joined_at: string;
  username: string;
  avatar_url: string | null;
}

interface BanRow {
  id: string;
  user_id: string;
  username: string;
  reason: string | null;
  banned_at: string;
  banned_by_name: string | null;
}

interface LogRow {
  id: string;
  action_type: string;
  reason: string | null;
  created_at: string;
  moderator_name: string;
  target_name: string;
}

const LOG_LABEL: Record<string, string> = {
  kick: 'Wyrzucenie z rozmowy',
  ban: 'Blokada',
  unban: 'Zdjęcie blokady',
  remove_member: 'Usunięcie z pokoju',
  role_change: 'Zmiana roli',
};

async function fetchProfiles(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map: Record<string, { username: string; avatar_url: string | null }> = {};
  if (unique.length === 0) return map;
  const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', unique);
  (data ?? []).forEach((p: any) => {
    map[p.id] = { username: p.username || 'Użytkownik', avatar_url: p.avatar_url ?? null };
  });
  return map;
}

/** Awatar mówiącej osoby dostaje po lewej kreski dźwięku z logo (ticksClassName włącza je). */
function ParticipantAvatar({
  name,
  url,
  speaking,
  className,
  textClass,
  ticksClassName,
}: {
  name: string;
  url?: string | null;
  speaking: boolean;
  className: string;
  textClass: string;
  ticksClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  const avatar =
    url && !failed ? (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} rounded-full border border-line object-cover`}
      />
    ) : (
      <div
        className={`${className} ${textClass} font-display flex items-center justify-center rounded-full uppercase transition-colors ${
          speaking ? 'bg-lime text-ink' : 'bg-line text-paper'
        }`}
      >
        {name[0]}
      </div>
    );

  if (!ticksClassName) return avatar;

  return (
    <div className="relative">
      {speaking && (
        <Ticks
          active
          className={`absolute right-full top-1/2 mr-0.5 -translate-y-1/2 text-lime ${ticksClassName}`}
        />
      )}
      {avatar}
    </div>
  );
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
  if (m.includes('INVALID_INVITE')) return 'Nieprawidłowy kod zaproszenia albo zaproszenia zostały wyłączone.';
  if (m.includes('NOT_AUTHENTICATED')) return 'Sesja wygasła. Zaloguj się ponownie.';
  return 'Nie udało się dołączyć do pokoju.';
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const [roomId, setRoomId] = useState<string>('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let paramVal = params?.roomId || params?.id || params?.slug;

    if (!paramVal && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      paramVal = parts[parts.length - 1];
    }

    const rawString = typeof paramVal === 'string' ? paramVal : Array.isArray(paramVal) ? paramVal[0] : '';
    if (rawString && rawString !== 'undefined') {
      setRoomId(decodeURIComponent(rawString));
    }
  }, [params]);

  const fetchInfo = async (name: string): Promise<RoomInfo | null> => {
    const { data } = await supabase.rpc('room_info', { p_name: name });
    return (data as RoomInfo) ?? null;
  };

  // Token do rozmowy dostaje tylko członek bez blokady (sprawdza to serwer)
  const loadToken = async (name: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
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
  };

  // Wejście z kodem zaproszenia: osoba zostaje dopisana do członków pokoju
  const joinWithCode = async (name: string, inviteCode: string) => {
    const { error: joinError } = await supabase.rpc('join_room', { p_name: name, p_code: inviteCode });
    if (joinError) return inviteErrorText(joinError.message);

    const fresh = await fetchInfo(name);
    if (!fresh?.exists) return 'Nie udało się dołączyć do pokoju.';
    setInfo(fresh);
    setPhase('loading');
    await loadToken(name);
    return '';
  };

  useEffect(() => {
    if (!roomId) return;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      setUsername(profile?.username || user.email?.split('@')[0] || 'Użytkownik');

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

      // Nie jesteś członkiem: jeśli link zawiera zaproszenie, próbujemy z nim wejść
      const invite = new URLSearchParams(window.location.search).get('invite');
      if (invite) {
        const message = await joinWithCode(roomId, invite);
        if (!message) return;
        setCodeError(message);
      }
      setPhase('noaccess');
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, router]);

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
          <h1 className="font-display text-5xl leading-none tracking-wide">Ten pokój jest zamknięty</h1>
          <p className="mt-4 leading-relaxed text-mute">
            Nie należysz do tego pokoju albo on nie istnieje. Wejdziesz, jeśli administrator doda Cię po
            nazwie użytkownika albo podasz kod zaproszenia.
          </p>

          <form onSubmit={handleSubmitCode} className="mt-8 space-y-4">
            <div>
              <label htmlFor="invite-code" className="label">Kod zaproszenia</label>
              <input
                id="invite-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                className="field"
              />
            </div>

            {codeError && <p role="alert" className="text-sm text-danger">{codeError}</p>}

            <button type="submit" disabled={joining || !code.trim()} className="btn btn-primary min-h-12 w-full">
              {joining ? 'Sprawdzanie...' : 'Wejdź do pokoju'}
            </button>
            <button type="button" onClick={() => router.push('/dashboard')} className="btn btn-ghost w-full">
              Wróć do panelu
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase !== 'ready' || !token || !roomId || !info) {
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
      // Wyrzucenie z rozmowy przez moderatora kończy się powrotem do panelu
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
  currentUser: any;
  username: string;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenQuality, setScreenQuality] = useState<ScreenQualityKey>('1080p60');

  const [showSidePanel, setShowSidePanel] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<'chat' | 'members' | 'stats'>('chat');
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [panelError, setPanelError] = useState('');
  const [panelNotice, setPanelNotice] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [webrtcStats, setWebrtcStats] = useState<WebRTCStats>({
    rtt: null,
    jitter: null,
    packetLossPercent: null,
    bitrateInbound: 0,
    bitrateOutbound: 0,
    resolution: null,
    fps: null,
    audioCodec: null,
    videoCodec: null,
    transportState: null,
  });

  const prevStatsRef = useRef<{ bytesSent: number; bytesRecv: number; time: number }>({
    bytesSent: 0,
    bytesRecv: 0,
    time: 0,
  });

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
  const idsKey = JSON.stringify(
    Array.from(
      new Set(
        [currentUser?.id, ...participants.map((p) => p.identity)].filter(Boolean) as string[]
      )
    ).sort()
  );

  useEffect(() => {
    const ids: string[] = JSON.parse(idsKey);
    if (ids.length === 0) return;

    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Błąd zapytania awatarów:', error.message);
          return;
        }
        const map: Record<string, string> = {};
        (data ?? []).forEach((row) => {
          if (row.avatar_url) map[row.id] = row.avatar_url;
        });
        setAvatars(map);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setShowSidePanel(true);
    }
  }, []);

  useEffect(() => {
    if (!room) return;

    const interval = setInterval(async () => {
      try {
        let totalBytesSent = 0;
        let totalBytesRecv = 0;
        let packetsLostTotal = 0;
        let packetsRecvTotal = 0;
        let currentRtt: number | null = null;
        let currentJitter: number | null = null;
        let resStr: string | null = null;
        let currentFps: number | null = null;
        let aCodec: string | null = null;
        let vCodec: string | null = null;

        const engine = (room as any).engine;
        if (engine) {
          if (typeof engine.rtt === 'number' && engine.rtt > 0) {
            currentRtt = Math.round(engine.rtt);
          } else if (typeof engine.client?.rtt === 'number' && engine.client.rtt > 0) {
            currentRtt = Math.round(engine.client.rtt);
          }
        }

        const pcsSet = new Set<RTCPeerConnection>();
        if (engine?.publisher?.pc) pcsSet.add(engine.publisher.pc);
        if (engine?.publisher?.peerConnection) pcsSet.add(engine.publisher.peerConnection);
        if (engine?.subscriber?.pc) pcsSet.add(engine.subscriber.pc);
        if (engine?.subscriber?.peerConnection) pcsSet.add(engine.subscriber.peerConnection);

        const reports: RTCStatsReport[] = [];

        for (const pc of pcsSet) {
          if (pc && typeof pc.getStats === 'function') {
            try {
              const s = await pc.getStats();
              reports.push(s);
            } catch {}
          }
        }

        const allTrackPubs = [
          ...Array.from(room.localParticipant.trackPublications.values()),
          ...Array.from(room.remoteParticipants.values()).flatMap((p) =>
            Array.from(p.trackPublications.values())
          ),
        ];

        for (const pub of allTrackPubs) {
          if (pub.track && typeof (pub.track as any).getRTCStatsReport === 'function') {
            try {
              const rep = await (pub.track as any).getRTCStatsReport();
              if (rep) reports.push(rep);
            } catch {}
          }
        }

        for (const stats of reports) {
          stats.forEach((report) => {
            if (report.type === 'outbound-rtp') {
              if (typeof report.bytesSent === 'number') {
                totalBytesSent += report.bytesSent;
              }
              const w = report.frameWidth || report.width;
              const h = report.frameHeight || report.height;
              if (w && h) resStr = `${w}x${h}`;
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'inbound-rtp') {
              if (typeof report.bytesReceived === 'number') {
                totalBytesRecv += report.bytesReceived;
              }
              if (typeof report.packetsLost === 'number') {
                packetsLostTotal += report.packetsLost;
              }
              if (typeof report.packetsReceived === 'number') {
                packetsRecvTotal += report.packetsReceived;
              }
              if (typeof report.jitter === 'number') {
                currentJitter = Math.round(report.jitter * 1000);
              }
              const w = report.frameWidth || report.width;
              const h = report.frameHeight || report.height;
              if (w && h) resStr = `${w}x${h}`;
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'remote-inbound-rtp') {
              if (typeof report.roundTripTime === 'number' && report.roundTripTime > 0) {
                currentRtt = Math.round(report.roundTripTime * 1000);
              }
              if (typeof report.jitter === 'number') {
                currentJitter = Math.round(report.jitter * 1000);
              }
              if (typeof report.packetsLost === 'number') {
                packetsLostTotal += report.packetsLost;
              }
            }

            if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
              if (typeof report.currentRoundTripTime === 'number' && report.currentRoundTripTime > 0) {
                currentRtt = Math.round(report.currentRoundTripTime * 1000);
              }
            }

            if (report.type === 'media-source' && (report.width || report.frameWidth)) {
              const w = report.width || report.frameWidth;
              const h = report.height || report.frameHeight;
              if (w && h) resStr = `${w}x${h}`;
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'codec' && report.mimeType) {
              const mime = report.mimeType.toLowerCase();
              if (mime.startsWith('audio/')) aCodec = report.mimeType;
              if (mime.startsWith('video/')) vCodec = report.mimeType;
            }
          });
        }

        if (!resStr || !currentFps) {
          const allMediaTracks: MediaStreamTrack[] = [];
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack) allMediaTracks.push(pub.track.mediaStreamTrack);
          });
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track?.mediaStreamTrack) allMediaTracks.push(pub.track.mediaStreamTrack);
            });
          });

          for (const mst of allMediaTracks) {
            if (mst.kind === 'video') {
              const settings = mst.getSettings();
              if (!resStr && settings.width && settings.height) {
                resStr = `${settings.width}x${settings.height}`;
              }
              if (!currentFps && settings.frameRate) {
                currentFps = Math.round(settings.frameRate);
              }
            }
          }
        }

        const now = Date.now();
        let bitOut = 0;
        let bitIn = 0;

        if (prevStatsRef.current.time > 0) {
          const deltaSec = (now - prevStatsRef.current.time) / 1000;
          if (deltaSec > 0) {
            const sentDiff = totalBytesSent - prevStatsRef.current.bytesSent;
            const recvDiff = totalBytesRecv - prevStatsRef.current.bytesRecv;
            if (sentDiff > 0) {
              bitOut = Math.round((sentDiff * 8) / deltaSec / 1000);
            }
            if (recvDiff > 0) {
              bitIn = Math.round((recvDiff * 8) / deltaSec / 1000);
            }
          }
        }

        prevStatsRef.current = {
          bytesSent: totalBytesSent,
          bytesRecv: totalBytesRecv,
          time: now,
        };

        const totalPackets = packetsRecvTotal + packetsLostTotal;
        const lossRate = totalPackets > 0 ? Number(((packetsLostTotal / totalPackets) * 100).toFixed(2)) : 0;

        const hasAudio = room.localParticipant.isMicrophoneEnabled || Array.from(room.remoteParticipants.values()).some(p => p.isMicrophoneEnabled);
        const hasVideo = room.localParticipant.isCameraEnabled || room.localParticipant.isScreenShareEnabled || Array.from(room.remoteParticipants.values()).some(p => p.isCameraEnabled || p.isScreenShareEnabled);

        setWebrtcStats({
          rtt: currentRtt,
          jitter: currentJitter,
          packetLossPercent: lossRate,
          bitrateInbound: bitIn,
          bitrateOutbound: bitOut,
          resolution: resStr,
          fps: currentFps,
          audioCodec: hasAudio ? (aCodec || 'audio/opus') : null,
          videoCodec: hasVideo ? (vCodec || 'video/VP8') : null,
          transportState: room.state,
        });
      } catch (err) {
        console.error('Błąd odczytu parametrów WebRTC:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room]);

  // Wiadomości pokoju (dostęp ogranicza baza: tylko członkowie bez blokady)
  useEffect(() => {
    const fetchMsgs = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(username)')
        .eq('room_id', roomInfo.id)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as any);
      }
    };

    fetchMsgs();
    const interval = setInterval(fetchMsgs, 3000);
    return () => clearInterval(interval);
  }, [roomInfo.id]);

  // ── Członkowie i moderacja ────────────────────────────────
  // Każdy, kto wszedł do pokoju, jest zapisany na liście członków (także po wyjściu z rozmowy).
  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('user_id, role, joined_at')
      .eq('room_id', roomInfo.id);
    if (error || !data) return;

    const profiles = await fetchProfiles(data.map((m: any) => m.user_id));
    setMembers(
      data.map((m: any) => ({
        user_id: m.user_id,
        role: normalizeRole(m.role) ?? 'member',
        joined_at: m.joined_at,
        username: profiles[m.user_id]?.username || 'Użytkownik',
        avatar_url: profiles[m.user_id]?.avatar_url ?? null,
      }))
    );
  }, [roomInfo.id]);

  const roleById: Record<string, RoomRole> = {};
  members.forEach((m) => {
    roleById[m.user_id] = m.role;
  });
  const myRole: RoomRole = roleById[currentUser?.id] ?? normalizeRole(roomInfo.role) ?? 'member';
  const myRank = roleRank(myRole);

  useEffect(() => {
    loadMembers();
    const interval = setInterval(loadMembers, 8000);
    return () => clearInterval(interval);
  }, [loadMembers, idsKey]);

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
      ...(banData ?? []).flatMap((b: any) => [b.user_id, b.banned_by]),
      ...(logData ?? []).flatMap((l: any) => [l.moderator_id, l.target_user_id]),
    ];
    const profiles = await fetchProfiles(ids);

    setBans(
      (banData ?? []).map((b: any) => ({
        id: b.id,
        user_id: b.user_id,
        username: profiles[b.user_id]?.username || 'Użytkownik',
        reason: b.reason,
        banned_at: b.banned_at,
        banned_by_name: profiles[b.banned_by]?.username ?? null,
      }))
    );
    setLogs(
      (logData ?? []).map((l: any) => ({
        id: l.id,
        action_type: String(l.action_type),
        reason: l.reason,
        created_at: l.created_at,
        moderator_name: profiles[l.moderator_id]?.username || 'Użytkownik',
        target_name: profiles[l.target_user_id]?.username || 'Użytkownik',
      }))
    );
  }, [roomInfo.id]);

  useEffect(() => {
    if (myRank < 2 || !showSidePanel || activeSideTab !== 'members') return;
    loadModeration();
    const interval = setInterval(loadModeration, 8000);
    return () => clearInterval(interval);
  }, [myRank, showSidePanel, activeSideTab, loadModeration]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, showSidePanel, activeSideTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const content = newMessage.trim();
    if (!content) return;

    if (!currentUser?.id) {
      alert('Błąd: Brak zidentyfikowanej sesji użytkownika.');
      return;
    }

    setNewMessage('');

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          room_id: roomInfo.id,
          sender_id: currentUser.id,
          content: content,
        },
      ])
      .select('*, profiles:sender_id(username)')
      .single();

    if (error) {
      console.error('Błąd zapisu wiadomości w Supabase:', error);
      alert(`Błąd wysyłania wiadomości: ${error.message}`);
      return;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data as any];
      });
    }
  };

  const toggleMic = async () => {
    const nextState = !isMicOn;
    await localParticipant.setMicrophoneEnabled(nextState);
    setIsMicOn(nextState);
  };

  const toggleCam = async () => {
    const nextState = !isCamOn;
    await localParticipant.setCameraEnabled(nextState);
    setIsCamOn(nextState);
  };

  const toggleScreenShare = async () => {
    const nextState = !isScreenSharing;

    if (nextState) {
      const selected = SCREEN_PRESETS[screenQuality];
      const publication = await localParticipant.setScreenShareEnabled(
        true,
        {
          audio: true,
          resolution: selected.capture,
        },
        {
          // Dla ekranu LiveKit czyta screenShareEncoding (videoEncoding dotyczy tylko kamery)
          screenShareEncoding: selected.encoding,
          simulcast: true,
        }
      );

      if (publication?.track?.mediaStreamTrack) {
        const track = publication.track.mediaStreamTrack;
        if ('contentHint' in track) {
          (track as any).contentHint = 'motion';
        }
      }
    } else {
      await localParticipant.setScreenShareEnabled(false);
    }

    setIsScreenSharing(nextState);
  };

  const handleLeaveRoom = async () => {
    await room.disconnect();
    router.push('/dashboard');
  };

  // Link zaproszenia zawiera kod, więc wejście z niego dopisuje osobę do członków pokoju
  const handleCopyInvite = async () => {
    setPanelError('');
    setPanelNotice('');
    const { data } = await supabase.from('rooms').select('access_code').eq('id', roomInfo.id).maybeSingle();
    const inviteCode = (data as any)?.access_code as string | null | undefined;

    if (!inviteCode) {
      setShowSidePanel(true);
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
    // Błąd dziennika nie blokuje akcji moderacyjnej
    await supabase.from('moderation_logs').insert({
      room_id: roomInfo.id,
      moderator_id: currentUser.id,
      target_user_id: targetId,
      action_type: action,
      reason: reason ?? null,
    });
  };

  // Samo usunięcie z bazy nie rozłączy osoby z trwającej rozmowy, robi to serwer
  const kickFromCall = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/room-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ room: roomInfo.name, userId }),
      });
    } catch {
      /* osoby mogło nie być w rozmowie */
    }
  };

  const runModeration = async (action: () => Promise<void>, okText: string) => {
    setPanelError('');
    setPanelNotice('');
    setModerationBusy(true);
    try {
      await action();
      setPanelNotice(okText);
    } catch (e: any) {
      setPanelError(e?.message || 'Nie udało się wykonać operacji.');
    } finally {
      setModerationBusy(false);
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const target = addUsername.trim();
    if (!target) return;
    runModeration(async () => {
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
    runModeration(async () => {
      const { error } = await supabase
        .from('room_members')
        .update({ role: nextRole, granted_by: currentUser.id })
        .eq('room_id', roomInfo.id)
        .eq('user_id', m.user_id);
      if (error) throw error;
      await logAction('role_change', m.user_id, nextRole);
      await loadMembers();
      await loadModeration();
    }, nextRole === 'moderator' ? `${m.username} jest teraz moderatorem.` : `${m.username} nie jest już moderatorem.`);
  };

  const handleKick = (m: MemberRow) => {
    runModeration(async () => {
      await kickFromCall(m.user_id);
      await logAction('kick', m.user_id);
      await loadModeration();
    }, `${m.username} został rozłączony z rozmowy.`);
  };

  const handleRemoveMember = (m: MemberRow) => {
    if (!window.confirm(`Usunąć ${m.username} z pokoju? Żeby wrócić, będzie musiał zostać dodany albo użyć kodu.`)) return;
    runModeration(async () => {
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
    runModeration(async () => {
      const { error: banError } = await supabase.from('room_bans').insert({
        room_id: roomInfo.id,
        user_id: m.user_id,
        banned_by: currentUser.id,
        reason: reason.trim() || null,
      });
      if (banError) throw banError;

      await supabase.from('room_members').delete().eq('room_id', roomInfo.id).eq('user_id', m.user_id);
      await logAction('ban', m.user_id, reason.trim() || null);
      await kickFromCall(m.user_id);
      await loadMembers();
      await loadModeration();
    }, `${m.username} został zablokowany.`);
  };

  const handleUnban = (b: BanRow) => {
    runModeration(async () => {
      const { error } = await supabase.from('room_bans').delete().eq('id', b.id);
      if (error) throw error;
      await logAction('unban', b.user_id);
      await loadModeration();
    }, `Zdjęto blokadę: ${b.username}. Żeby wrócił, musi zostać dodany lub użyć kodu.`);
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pl-PL');
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

  const onlineIds = new Set(participants.map((p) => p.identity));
  const sortedMembers = [...members].sort(
    (a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username)
  );
  const onlineMembers = sortedMembers.filter((m) => onlineIds.has(m.user_id));
  const offlineMembers = sortedMembers.filter((m) => !onlineIds.has(m.user_id));

  const renderMember = (m: MemberRow, online: boolean) => {
    const p = participants.find((x) => x.identity === m.user_id);
    const isMe = m.user_id === currentUser?.id;
    const lower = roleRank(m.role) < myRank;
    const canModerate = myRank >= 2 && lower && !isMe;
    const canToggleMod = myRank >= 3 && m.role !== 'owner' && !isMe;

    return (
      <li key={m.user_id} className="py-2.5">
        <div className="flex items-center gap-3">
          <ParticipantAvatar
            name={m.username}
            url={m.avatar_url ?? avatars[m.user_id]}
            speaking={!!p?.isSpeaking}
            className="size-9 shrink-0"
            textClass="text-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-paper">
              {m.username}{' '}
              {isMe && <span className="text-xs font-normal text-mute">(Ty)</span>}
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
                onClick={() => handleToggleMod(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                {m.role === 'moderator' ? 'Odbierz moderatora' : 'Mianuj moderatorem'}
              </button>
            )}
            {canModerate && online && (
              <button
                onClick={() => handleKick(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Wyrzuć z rozmowy
              </button>
            )}
            {canModerate && (
              <button
                onClick={() => handleRemoveMember(m)}
                disabled={moderationBusy}
                className="btn btn-ghost min-h-8 px-2.5 text-xs"
              >
                Usuń z pokoju
              </button>
            )}
            {canModerate && (
              <button
                onClick={() => handleBan(m)}
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
          <h1 className="font-display truncate text-2xl leading-none tracking-wide">
            {roomId}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              setShowSidePanel(true);
              setActiveSideTab('members');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3"
            aria-label="Lista osób w pokoju"
          >
            <svg className="size-4 text-mute" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>{peopleLabel(participants.length)}</span>
          </button>

          <button
            onClick={() => {
              setShowSidePanel(true);
              setActiveSideTab('stats');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3 font-mono text-xs"
            aria-label="Statystyki WebRTC"
          >
            <svg className="size-4 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
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
          <div className={`grid h-full w-full items-center justify-items-center gap-3 sm:gap-4 ${getGridLayoutClass(cards.length)}`}>
            {cards.map(({ cam, screen }) => {
              const participant = cam.participant;
              const name = participant.name || participant.identity || 'Użytkownik';
              const isSpeaking = participant.isSpeaking;
              const camOn = !!cam.publication?.track && !cam.publication.isMuted;
              const avatarUrl = avatars[participant.identity];

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
                    <VideoTrack
                      trackRef={asRef(cam)}
                      className="h-full w-full object-cover"
                    />
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
                        <VideoTrack
                          trackRef={asRef(cam)}
                          className="h-full w-full object-cover"
                        />
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
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'chat' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Czat
                </button>
                <button
                  onClick={() => setActiveSideTab('members')}
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'members' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Osoby ({members.length || participants.length})
                </button>
                <button
                  onClick={() => setActiveSideTab('stats')}
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'stats' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Stats
                </button>
              </div>

              <button
                onClick={() => setShowSidePanel(false)}
                className="btn btn-ghost size-9 min-h-0 px-0 md:hidden"
                aria-label="Zamknij panel"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>

            {activeSideTab === 'chat' && (
              <>
                <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="mt-10 text-center text-sm text-mute">
                      Nikt jeszcze nic nie napisał. Zacznij pierwszy.
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.sender_id === currentUser?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          <div className="mb-1 flex items-baseline gap-2 text-xs text-mute">
                            {!mine && (
                              <>
                                <span className="font-semibold text-paper">
                                  {msg.profiles?.username || 'Użytkownik'}
                                </span>
                                {roleById[msg.sender_id] && (
                                  <RoleBadge role={roleById[msg.sender_id]} compact />
                                )}
                              </>
                            )}
                            <time dateTime={msg.created_at}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>
                          <p
                            className={`max-w-[85%] wrap-break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${
                              mine ? 'bg-lime text-ink' : 'bg-raised text-paper'
                            }`}
                          >
                            {msg.content}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-line p-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Napisz wiadomość..."
                    aria-label="Treść wiadomości"
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
              </>
            )}

            {activeSideTab === 'members' && (
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
                  <form onSubmit={handleAddMember} className="flex gap-2">
                    <input
                      type="text"
                      value={addUsername}
                      onChange={(e) => setAddUsername(e.target.value)}
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
                              onClick={() => handleUnban(b)}
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
            )}

            {activeSideTab === 'stats' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
                <div className="border-b border-line pb-2">
                  <h3 className="text-sm font-semibold text-paper uppercase tracking-wider">
                    Parametry połączenia
                  </h3>
                  <p className="text-[11px] text-mute font-sans">
                    Odczyt w czasie rzeczywistym z API WebRTC / LiveKit.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Stan sesji</span>
                    <span className="text-lime uppercase font-bold">
                      {webrtcStats.transportState || 'połączono'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Opóźnienie (RTT)</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.rtt !== null ? `${webrtcStats.rtt} ms` : 'b.d.'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Jitter</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.jitter !== null ? `${webrtcStats.jitter} ms` : '0 ms'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Utrata pakietów</span>
                    <span className={`font-semibold ${webrtcStats.packetLossPercent && webrtcStats.packetLossPercent > 2 ? 'text-danger' : 'text-paper'}`}>
                      {webrtcStats.packetLossPercent !== null ? `${webrtcStats.packetLossPercent}%` : '0%'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Bitrate Inbound</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.bitrateInbound} kbps
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Bitrate Outbound</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.bitrateOutbound} kbps
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Rozdzielczość wideo</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.resolution || 'Wideo wyłączone'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Liczba klatek (FPS)</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.fps !== null ? `${webrtcStats.fps} FPS` : 'Wideo wyłączone'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Kodek audio</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.audioCodec || 'Wyciszony'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Kodek wideo</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.videoCodec || 'Wyłączony'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
            aria-label={isScreenSharing ? 'Zakończ udostępnianie ekranu' : 'Udostępnij ekran'}
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
            setShowSidePanel(!showSidePanel);
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