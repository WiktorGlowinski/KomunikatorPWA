export type RoomRole = 'owner' | 'moderator' | 'member';

export interface ProfileSummary {
  username: string;
  avatar_url: string | null;
}

export interface Room {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  owner_id: string;
  is_private: boolean;
  access_code?: string | null;
}

export interface RoomInfo {
  exists: boolean;
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  role: string | null;
  is_banned: boolean;
}

export interface MemberRow {
  user_id: string;
  role: RoomRole;
  joined_at: string;
  username: string;
  avatar_url: string | null;
}

export interface BanRow {
  id: string;
  user_id: string;
  username: string;
  reason: string | null;
  banned_at: string;
  banned_by_name: string | null;
}

export interface LogRow {
  id: string;
  action_type: string;
  reason: string | null;
  created_at: string;
  moderator_name: string;
  target_name: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?:
    | {
        username: string;
        avatar_url?: string | null;
      }
    | {
        username: string;
        avatar_url?: string | null;
      }[]
    | null;
}

export interface WebRTCStats {
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

export const ROLE_LABEL: Record<RoomRole, string> = {
  owner: 'Administrator',
  moderator: 'Moderator',
  member: 'Członek',
};

export const normalizeRole = (role?: string | null): RoomRole | null => {
  if (!role) return null;
  if (role === 'owner' || role === 'admin') return 'owner';
  if (role === 'moderator') return 'moderator';
  return 'member';
};

export const roleRank = (role?: RoomRole | null) =>
  role === 'owner' ? 3 : role === 'moderator' ? 2 : role === 'member' ? 1 : 0;

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}
