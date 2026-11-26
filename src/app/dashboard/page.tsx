'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { getErrorMessage, type Room } from '@/lib/types';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { FullScreenLoader } from '@/components/Spinner';

interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
  profiles?:
    | {
        username: string;
        avatar_url: string | null;
      }
    | {
        username: string;
        avatar_url: string | null;
      }[]
    | null;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function DashboardPage() {
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [roomName, setRoomName] = useState('');
  const [isPrivateNew, setIsPrivateNew] = useState(false);
  const [accessCodeNew, setAccessCodeNew] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [editAccessCode, setEditAccessCode] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [managingMembersRoom, setManagingMembersRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchAddUsername, setSearchAddUsername] = useState('');
  const [memberActionMsg, setMemberActionMsg] = useState('');
  const [memberActionError, setMemberActionError] = useState('');

  const [username, setUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('id, name, description, created_at, owner_id, is_private')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRooms(data as Room[]);
    }
  }, []);

  useEffect(() => {
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
        .select('username, avatar_url')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile) {
        const currentName = profile.username || authUser.email?.split('@')[0] || '';
        setUsername(currentName);
        setNewUsername(currentName);
        setAvatarUrl(profile.avatar_url || '');
        setNewAvatarUrl(profile.avatar_url || '');
      } else {
        const fallbackName = authUser.email?.split('@')[0] || '';
        setUsername(fallbackName);
        setNewUsername(fallbackName);
      }

      try {
        const saved = sessionStorage.getItem('chatter:room');
        if (saved) {
          setRoomName(saved);
          sessionStorage.removeItem('chatter:room');
        }
      } catch {}

      await fetchRooms();
      setLoading(false);
    };
    void init();
  }, [router, fetchRooms]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setEditingRoom(null);
        setManagingMembersRoom(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slug = roomName.trim().toLowerCase().replace(/\s+/g, '-');

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanSlug = roomName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanSlug || !user) return;

    setSubmitting(true);
    try {
      const { data: newRoom, error } = await supabase
        .from('rooms')
        .insert([
          {
            name: cleanSlug,
            owner_id: user.id,
            is_private: isPrivateNew,
            access_code: isPrivateNew ? accessCodeNew.trim() || null : null,
          },
        ])
        .select('id, name')
        .single();

      if (error) throw error;

      if (newRoom) {
        await supabase.from('room_members').insert([
          {
            room_id: newRoom.id,
            user_id: user.id,
            role: 'owner',
            granted_by: user.id,
          },
        ]);
      }

      router.push(`/room/${cleanSlug}`);
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Błąd podczas tworzenia pokoju.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditRoom = async (room: Room) => {
    setEditingRoom(room);
    setEditName(room.name);
    setEditDescription(room.description || '');
    setEditIsPrivate(room.is_private || false);
    setEditAccessCode('');

    if (room.is_private) {
      const { data } = await supabase
        .from('rooms')
        .select('access_code')
        .eq('id', room.id)
        .maybeSingle();
      if (data?.access_code) {
        setEditAccessCode(data.access_code);
      }
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    if (!user || room.owner_id !== user.id) return;

    const confirmed = window.confirm(
      `Czy na pewno chcesz trwale usunąć pokój "${room.name}"? Tej operacji nie można cofnąć.`
    );
    if (!confirmed) return;

    setDeletingRoomId(room.id);
    try {
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', room.id)
        .eq('owner_id', user.id);

      if (error) throw error;

      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      if (editingRoom?.id === room.id) setEditingRoom(null);
      if (managingMembersRoom?.id === room.id) setManagingMembersRoom(null);
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Błąd podczas usuwania pokoju.'));
    } finally {
      setDeletingRoomId(null);
    }
  };

  const handleSaveRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    const cleanSlug = editName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanSlug) return;

    setSavingRoom(true);
    try {
      const { error } = await supabase
        .from('rooms')
        .update({
          name: cleanSlug,
          description: editDescription.trim() || null,
          is_private: editIsPrivate,
          access_code: editIsPrivate ? editAccessCode.trim() || null : null,
        })
        .eq('id', editingRoom.id);

      if (error) throw error;

      setEditingRoom(null);
      await fetchRooms();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Błąd podczas edycji pokoju.'));
    } finally {
      setSavingRoom(false);
    }
  };

  const fetchRoomMembers = async (roomId: string) => {
    setLoadingMembers(true);
    const { data, error } = await supabase
      .from('room_members')
      .select('id, room_id, user_id, role, joined_at, profiles:user_id(username, avatar_url)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (!error && data) {
      setMembers(data as RoomMember[]);
    }
    setLoadingMembers(false);
  };

  const handleOpenMembersModal = async (room: Room) => {
    setManagingMembersRoom(room);
    setSearchAddUsername('');
    setMemberActionMsg('');
    setMemberActionError('');
    await fetchRoomMembers(room.id);
  };

  const handleAddUserToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMembersRoom || !searchAddUsername.trim() || !user) return;

    setMemberActionMsg('');
    setMemberActionError('');

    const targetUsername = searchAddUsername.trim();

    try {
      const { data: targetProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', targetUsername)
        .maybeSingle();

      if (profileErr || !targetProfile) {
        setMemberActionError(`Nie znaleziono użytkownika o nazwie "${targetUsername}".`);
        return;
      }

      const isAlreadyMember = members.some((m) => m.user_id === targetProfile.id);
      if (isAlreadyMember) {
        setMemberActionError(`Użytkownik "${targetUsername}" jest już w tym pokoju.`);
        return;
      }

      const { error: insertErr } = await supabase.from('room_members').insert([
        {
          room_id: managingMembersRoom.id,
          user_id: targetProfile.id,
          role: 'member',
          granted_by: user.id,
        },
      ]);

      if (insertErr) throw insertErr;

      setMemberActionMsg(`Dodano użytkownika ${targetUsername} do pokoju.`);
      setSearchAddUsername('');
      await fetchRoomMembers(managingMembersRoom.id);
    } catch (err: unknown) {
      setMemberActionError(getErrorMessage(err, 'Błąd podczas dodawania użytkownika.'));
    }
  };

  const handleToggleModeratorRole = async (member: RoomMember) => {
    if (!managingMembersRoom || !user) return;

    const newRole = member.role === 'moderator' ? 'member' : 'moderator';

    try {
      const { error } = await supabase
        .from('room_members')
        .update({
          role: newRole,
          granted_by: user.id,
        })
        .eq('id', member.id);

      if (error) throw error;

      await fetchRoomMembers(managingMembersRoom.id);
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Błąd zmiany uprawnień.'));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!managingMembersRoom) return;
    if (!confirm('Czy na pewno chcesz usunąć tego użytkownika z pokoju?')) return;

    try {
      const { error } = await supabase.from('room_members').delete().eq('id', memberId);

      if (error) throw error;
      await fetchRoomMembers(managingMembersRoom.id);
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Błąd usuwania członka.'));
    }
  };

  const handleCopyInvite = async (room: Room) => {
    const { data, error: roomError } = await supabase
      .from('rooms')
      .select('access_code')
      .eq('id', room.id)
      .maybeSingle();

    if (roomError) {
      alert(getErrorMessage(roomError, 'Nie udało się utworzyć zaproszenia.'));
      return;
    }

    let inviteCode = data?.access_code;
    if (!inviteCode) {
      inviteCode = crypto.randomUUID();
      const { data: updatedRoom, error } = await supabase
        .from('rooms')
        .update({ access_code: inviteCode })
        .eq('id', room.id)
        .select('id')
        .maybeSingle();

      if (error) {
        alert(getErrorMessage(error, 'Nie udało się utworzyć zaproszenia.'));
        return;
      }
      if (!updatedRoom) {
        alert('Tylko właściciel pokoju może utworzyć nowe zaproszenie.');
        return;
      }
    }

    const inviteLink = `${window.location.origin}/room/${room.name}?invite=${encodeURIComponent(inviteCode)}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedId(room.id);
      setTimeout(() => setCopiedId((current) => (current === room.id ? null : current)), 2000);
    } catch {
      window.prompt('Skopiuj link zaproszenia:', inviteLink);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileMsg('');
    setProfileError('');

    const trimmedName = newUsername.trim();
    if (!trimmedName) {
      setProfileError('Login nie może być pusty.');
      return;
    }

    setSavingProfile(true);

    try {
      if (trimmedName.toLowerCase() !== username.toLowerCase()) {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmedName)
          .neq('id', user.id)
          .maybeSingle();

        if (existingUser) {
          setProfileError(`Login "${trimmedName}" jest już zajęty. Wybierz inny.`);
          setSavingProfile(false);
          return;
        }
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username: trimmedName,
        avatar_url: newAvatarUrl.trim() || null,
      });
      if (error) throw error;

      setUsername(trimmedName);
      setAvatarUrl(newAvatarUrl.trim());
      setProfileMsg('Profil zaktualizowany.');
    } catch (err: unknown) {
      setProfileError(getErrorMessage(err, 'Błąd zapisu profilu.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setProfileError('');
    setProfileMsg('');

    if (!file.type.startsWith('image/')) {
      setProfileError('Wybrany plik musi być obrazem.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setProfileError('Maksymalny rozmiar awatara to 2 MB.');
      return;
    }

    setSavingProfile(true);

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `avatars/${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      setNewAvatarUrl(publicUrl);
      setProfileMsg('Wczytano awatar. Zapisz profil.');
    } catch (err: unknown) {
      setProfileError(getErrorMessage(err, 'Nie udało się wysłać awatara.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('Hasło musi mieć co najmniej 6 znaków.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Podane hasła nie są identyczne.');
      return;
    }

    setSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordMsg('Hasło zmienione.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, 'Błąd zmiany hasła.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return <FullScreenLoader text="Sprawdzam sesję..." />;
  }

  const displayName = username || user?.email?.split('@')[0] || '';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Brand />

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="btn btn-ghost gap-2.5 px-3"
          aria-label="Otwórz ustawienia konta"
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-7 rounded-full border border-line object-cover"
            />
          ) : (
            <span className="font-display flex size-7 items-center justify-center rounded-full bg-line text-lg uppercase leading-none">
              {(displayName || 'U')[0]}
            </span>
          )}
          <span className="max-w-[10rem] truncate">{displayName}</span>
          <Icon name="gear" className="size-4 text-mute" />
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-14 px-5 py-10 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-16">
        <section>
          <h1 className="font-display text-[clamp(3.5rem,8vw,6rem)] leading-[0.9] tracking-wide">
            Utwórz pokój
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-mute">
            Nazwa stanie się częścią linku zaproszenia. Ustaw opcjonalną prywatność i kod dostępu.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mt-6 max-w-lg rounded-md border border-danger/40 bg-danger/10 p-3.5 text-sm text-danger"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleCreateRoom} className="mt-8 max-w-lg space-y-4">
            <div>
              <label htmlFor="room-name" className="label">
                Nazwa pokoju
              </label>
              <div className="flex min-h-12 items-center rounded-md border border-line bg-panel transition-colors focus-within:border-lime focus-within:ring-2 focus-within:ring-lime/25">
                <span className="select-none pl-4 text-sm text-mute">/room/</span>
                <input
                  id="room-name"
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="sala-projektowa"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent py-3 pl-1 pr-4 text-sm text-paper placeholder:text-mute/60 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-line bg-panel p-3.5">
              <span className="text-sm font-semibold text-paper">Pokój prywatny</span>
              <input
                type="checkbox"
                checked={isPrivateNew}
                onChange={(e) => setIsPrivateNew(e.target.checked)}
                className="size-4 cursor-pointer rounded accent-lime"
              />
            </div>

            {isPrivateNew && (
              <div>
                <label htmlFor="room-access-code" className="label">
                  Kod dostępu (access_code)
                </label>
                <input
                  id="room-access-code"
                  type="password"
                  required={isPrivateNew}
                  value={accessCodeNew}
                  onChange={(e) => setAccessCodeNew(e.target.value)}
                  placeholder="Wprowadź kod dostępu..."
                  className="field min-h-12"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary min-h-12 w-full px-7 text-base"
            >
              {submitting ? 'Tworzenie…' : 'Utwórz i wejdź'}
            </button>

            {slug && (
              <p className="mt-3 break-all text-sm text-mute">
                Link do pokoju: {window.location.origin}/room/{slug}
              </p>
            )}
          </form>
        </section>

        <section>
          <h2 className="font-display text-4xl tracking-wide sm:text-5xl">
            Dostępne pokoje <span className="text-mute">({rooms.length})</span>
          </h2>

          {rooms.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-line p-6 text-mute">
              Nie ma jeszcze żadnych pokojów. Utwórz pierwszy, a pojawi się tutaj.
            </p>
          ) : (
            <ul className="mt-6 max-h-[32rem] divide-y divide-line overflow-y-auto border-y border-line">
              {rooms.map((room) => {
                const isOwner = room.owner_id === user?.id;
                const copied = copiedId === room.id;
                return (
                  <li key={room.id} className="flex items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-paper">{room.name}</p>
                        {room.is_private && (
                          <span className="rounded border border-danger/40 bg-danger/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-danger">
                            Prywatny
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-mute">
                        {isOwner ? 'Twój pokój • ' : ''}
                        {new Date(room.created_at).toLocaleDateString('pl-PL')}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isOwner && (
                        <>
                          <button
                            onClick={() => handleOpenMembersModal(room)}
                            className="btn btn-ghost size-10 min-h-0 px-0"
                            title="Zarządzaj członkami i rolami"
                            aria-label={`Zarządzaj członkami pokoju ${room.name}`}
                          >
                            <Icon name="users" className="size-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditRoom(room)}
                            className="btn btn-ghost size-10 min-h-0 px-0"
                            title="Edytuj kanał i kod dostępu"
                            aria-label={`Edytuj pokój ${room.name}`}
                          >
                            <Icon name="gear" className="size-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room)}
                            disabled={deletingRoomId === room.id}
                            className="btn btn-danger size-10 min-h-0 px-0"
                            title="Usuń pokój"
                            aria-label={`Usuń pokój ${room.name}`}
                          >
                            <Icon name="trash" className="size-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleCopyInvite(room)}
                        className="btn btn-ghost size-10 min-h-0 px-0"
                        title="Utwórz lub kopiuj zaproszenie"
                        aria-label={`Utwórz lub kopiuj zaproszenie do pokoju ${room.name}`}
                      >
                        <Icon name={copied ? 'check' : 'link'} className="size-4" />
                      </button>

                      <button
                        onClick={() => router.push(`/room/${room.name}`)}
                        className="btn btn-primary min-h-10 px-4"
                      >
                        Dołącz
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl border-t border-line px-5 py-6 text-sm text-mute sm:px-8">
        CHATTER © {new Date().getFullYear()}
      </footer>

      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={() => setEditingRoom(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-2xl">
            <h3 className="font-display mb-1 text-2xl tracking-wide">Edycja pokoju</h3>
            <p className="mb-4 text-sm text-mute">
              Zaktualizuj nazwę, opis oraz prywatność pokoju.
            </p>

            <form onSubmit={handleSaveRoomSettings} className="space-y-4">
              <div>
                <label className="label">Nazwa pokoju (slug)</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="field"
                />
              </div>

              <div>
                <label className="label">Opis pokoju</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Krótki opis celów pokoju..."
                  className="field"
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-line bg-panel p-3">
                <span className="text-sm font-semibold text-paper">Pokój prywatny</span>
                <input
                  type="checkbox"
                  checked={editIsPrivate}
                  onChange={(e) => setEditIsPrivate(e.target.checked)}
                  className="size-4 cursor-pointer rounded accent-lime"
                />
              </div>

              {editIsPrivate && (
                <div>
                  <label className="label">Kod dostępu (access_code)</label>
                  <input
                    type="password"
                    required={editIsPrivate}
                    value={editAccessCode}
                    onChange={(e) => setEditAccessCode(e.target.value)}
                    placeholder="Kod dostępu do pokoju"
                    className="field"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="btn btn-ghost"
                >
                  Anuluj
                </button>
                <button type="submit" disabled={savingRoom} className="btn btn-primary">
                  {savingRoom ? 'Zapisywanie...' : 'Zapisz zmiany'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managingMembersRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={() => setManagingMembersRoom(null)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col justify-between overflow-hidden rounded-xl border border-line bg-panel p-6 shadow-2xl">
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-display text-2xl tracking-wide">Uczestnicy pokoju</h3>
                  <p className="font-mono text-xs text-mute">
                    Pokój: #{managingMembersRoom.name}
                  </p>
                </div>
                <button
                  onClick={() => setManagingMembersRoom(null)}
                  className="btn btn-ghost size-9 min-h-0 px-0"
                >
                  <Icon name="close" className="size-4" />
                </button>
              </div>

              <form onSubmit={handleAddUserToRoom} className="mb-5 space-y-2">
                <label className="label">Dodaj użytkownika do pokoju</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={searchAddUsername}
                    onChange={(e) => setSearchAddUsername(e.target.value)}
                    placeholder="Wpisz login użytkownika..."
                    className="field min-h-10 flex-1"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary min-h-10 px-4 text-xs font-semibold uppercase"
                  >
                    Dodaj
                  </button>
                </div>

                {memberActionMsg && (
                  <div className="flex items-center gap-1.5 font-mono text-xs text-lime">
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{memberActionMsg}</span>
                  </div>
                )}
                {memberActionError && (
                  <div className="flex items-center gap-1.5 font-mono text-xs text-danger">
                    <Icon name="alert" className="size-4 shrink-0" />
                    <span>{memberActionError}</span>
                  </div>
                )}
              </form>

              <div className="space-y-2">
                <span className="label">Lista członków ({members.length})</span>
                {loadingMembers ? (
                  <p className="py-4 text-center text-xs text-mute">Ładowanie członków...</p>
                ) : members.length === 0 ? (
                  <p className="py-4 text-center text-xs text-mute">Brak dodanych członków.</p>
                ) : (
                  <ul className="max-h-60 divide-y divide-line/60 space-y-2 overflow-y-auto pr-1">
                    {members.map((member) => {
                      const isOwner = member.role === 'owner';
                      const isMod = member.role === 'moderator';
                      const profile = Array.isArray(member.profiles)
                        ? member.profiles[0]
                        : member.profiles;

                      return (
                        <li key={member.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            {profile?.avatar_url ? (
                              <Image
                                src={profile.avatar_url}
                                alt=""
                                width={32}
                                height={32}
                                unoptimized
                                className="size-8 rounded-full border border-line object-cover"
                              />
                            ) : (
                              <div className="font-display flex size-8 items-center justify-center rounded-full bg-line text-xs font-bold uppercase">
                                {(profile?.username || 'U')[0]}
                              </div>
                            )}

                            <div>
                              <p className="text-sm font-semibold text-paper">
                                {profile?.username || 'Użytkownik'}
                              </p>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                                  isOwner
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                    : isMod
                                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                      : 'border-line bg-line/30 text-mute'
                                }`}
                              >
                                {member.role}
                              </span>
                            </div>
                          </div>

                          {!isOwner && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleModeratorRole(member)}
                                className={`rounded border px-2 py-1 font-mono text-[11px] transition ${
                                  isMod
                                    ? 'border-blue-700 bg-blue-950/60 text-blue-300'
                                    : 'border-line bg-panel text-mute hover:text-paper'
                                }`}
                                title={isMod ? 'Odbierz moderatora' : 'Mianuj moderatorem'}
                              >
                                {isMod ? 'Moderator' : 'Daj Moderatora'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.id)}
                                className="btn btn-ghost size-8 min-h-0 px-0 text-danger"
                                title="Usuń z pokoju"
                              >
                                <Icon name="close" className="size-4" />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setManagingMembersRoom(null)}
                className="btn btn-ghost"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-ink/70"
            onClick={() => setIsSettingsOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ustawienia konta"
            className="relative z-10 flex h-full w-full max-w-sm flex-col justify-between overflow-y-auto border-l border-line bg-panel p-6"
          >
            <div>
              <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
                <h2 className="font-display text-3xl tracking-wide">Ustawienia konta</h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="btn btn-ghost size-11 min-h-0 px-0"
                  aria-label="Zamknij ustawienia"
                >
                  <Icon name="close" className="size-5" />
                </button>
              </div>

              <div className="mb-8 space-y-4">
                <h3 className="text-lg font-semibold">Profil</h3>

                {profileMsg && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime/10 p-2.5 text-sm text-lime"
                  >
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{profileMsg}</span>
                  </div>
                )}

                {profileError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger"
                  >
                    <Icon name="alert" className="size-4 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <span className="label">Awatar</span>
                    <div className="flex items-center gap-3">
                      {newAvatarUrl ? (
                        <Image
                          src={newAvatarUrl}
                          alt="Podgląd awatara"
                          width={56}
                          height={56}
                          unoptimized
                          className="size-14 shrink-0 rounded-full border border-line object-cover"
                        />
                      ) : (
                        <div className="font-display flex size-14 shrink-0 items-center justify-center rounded-full bg-line text-2xl uppercase">
                          {(newUsername || 'U')[0]}
                        </div>
                      )}

                      <div className="flex-1 space-y-2">
                        <label className="btn btn-ghost min-h-10 w-full cursor-pointer text-sm focus-within:outline-2 focus-within:outline-lime">
                          Wgraj z pliku
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarFileUpload}
                            className="sr-only"
                          />
                        </label>
                        <input
                          type="url"
                          value={newAvatarUrl}
                          onChange={(e) => setNewAvatarUrl(e.target.value)}
                          placeholder="lub wklej adres obrazu"
                          aria-label="Adres obrazu awatara"
                          className="field min-h-10"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-username" className="label">
                      Nazwa użytkownika
                    </label>
                    <input
                      id="new-username"
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="field"
                    />
                    <p className="mt-1.5 text-sm text-mute">
                      Nazwa musi być unikalna. Sprawdzimy to przy zapisie.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="btn btn-primary w-full"
                  >
                    {savingProfile ? 'Zapisywanie…' : 'Zapisz profil'}
                  </button>
                </form>
              </div>

              <div className="space-y-4 border-t border-line pt-6">
                <h3 className="text-lg font-semibold">Zmiana hasła</h3>

                {passwordMsg && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime/10 p-2.5 text-sm text-lime"
                  >
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{passwordMsg}</span>
                  </div>
                )}

                {passwordError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger"
                  >
                    <Icon name="alert" className="size-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div>
                    <label htmlFor="new-password" className="label">
                      Nowe hasło
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Co najmniej 6 znaków"
                      className="field"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="label">
                      Powtórz nowe hasło
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="field"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="btn btn-ghost w-full"
                  >
                    {savingPassword ? 'Zapisywanie…' : 'Zmień hasło'}
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-8 border-t border-line pt-6">
              <button onClick={handleSignOut} className="btn btn-danger w-full">
                <Icon name="leave" className="size-4" />
                Wyloguj się
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
