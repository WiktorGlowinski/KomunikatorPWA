'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { FullScreenLoader } from '@/components/Spinner';

interface Room {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  owner_id: string;
  is_private: boolean;
  access_code?: string | null;
}

interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [user, setUser] = useState<any>(null);
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

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        const currentName = profile.username || user.email?.split('@')[0] || '';
        setUsername(currentName);
        setNewUsername(currentName);
        setAvatarUrl(profile.avatar_url || '');
        setNewAvatarUrl(profile.avatar_url || '');
      } else {
        const fallbackName = user.email?.split('@')[0] || '';
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
    init();
  }, [router]);

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

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRooms(data);
    }
  };

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
            access_code: isPrivateNew ? (accessCodeNew.trim() || null) : null,
          },
        ])
        .select()
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd podczas tworzenia pokoju.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditRoom = (room: Room) => {
    setEditingRoom(room);
    setEditName(room.name);
    setEditDescription(room.description || '');
    setEditIsPrivate(room.is_private || false);
    setEditAccessCode(room.access_code || '');
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
          access_code: editIsPrivate ? (editAccessCode.trim() || null) : null,
        })
        .eq('id', editingRoom.id);

      if (error) throw error;

      setEditingRoom(null);
      await fetchRooms();
    } catch (err: any) {
      alert(err.message || 'Błąd podczas edycji pokoju.');
    } finally {
      setSavingRoom(false);
    }
  };

  const handleOpenMembersModal = async (room: Room) => {
    setManagingMembersRoom(room);
    setSearchAddUsername('');
    setMemberActionMsg('');
    setMemberActionError('');
    await fetchRoomMembers(room.id);
  };

  const fetchRoomMembers = async (roomId: string) => {
    setLoadingMembers(true);
    const { data, error } = await supabase
      .from('room_members')
      .select('*, profiles:user_id(username, avatar_url)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (!error && data) {
      setMembers(data as any);
    }
    setLoadingMembers(false);
  };

  const handleAddUserToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMembersRoom || !searchAddUsername.trim()) return;

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
    } catch (err: any) {
      setMemberActionError(err.message || 'Błąd podczas dodawania użytkownika.');
    }
  };

  const handleToggleModeratorRole = async (member: RoomMember) => {
    if (!managingMembersRoom) return;

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
    } catch (err: any) {
      alert(err.message || 'Błąd zmiany uprawnień.');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!managingMembersRoom) return;
    if (!confirm('Czy na pewno chcesz usunąć tego użytkownika z pokoju?')) return;

    try {
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      await fetchRoomMembers(managingMembersRoom.id);
    } catch (err: any) {
      alert(err.message || 'Błąd usuwania członka.');
    }
  };

  const handleCopyInvite = async (room: Room) => {
    const inviteLink = `${window.location.origin}/room/${room.name}`;
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

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username: trimmedName,
          avatar_url: newAvatarUrl.trim() || null,
        });
      if (error) throw error;

      setUsername(trimmedName);
      setAvatarUrl(newAvatarUrl.trim());
      setProfileMsg('Profil zaktualizowany.');
    } catch (err: any) {
      setProfileError(err.message || 'Błąd zapisu profilu.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setSavingProfile(true);
    setProfileError('');
    setProfileMsg('');

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `avatars/${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setNewAvatarUrl(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        setNewAvatarUrl(publicUrl);
      }
      setProfileMsg('Wczytano awatar. Zapisz profil.');
    } catch (err: any) {
      setProfileError('Błąd wczytywania pliku.');
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
    } catch (err: any) {
      setPasswordError(err.message || 'Błąd zmiany hasła.');
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
            <img
              src={avatarUrl}
              alt=""
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
                className="size-4 accent-lime rounded cursor-pointer"
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
            Dostępne pokoje{' '}
            <span className="text-mute">({rooms.length})</span>
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
                  <li
                    key={room.id}
                    className="flex items-center justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-paper">{room.name}</p>
                        {room.is_private && (
                          <span className="rounded bg-danger/20 border border-danger/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-danger font-mono">
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
                      <button
                        onClick={() => handleOpenMembersModal(room)}
                        className="btn btn-ghost size-10 min-h-0 px-0"
                        title="Zarządzaj członkami i rolami"
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => handleOpenEditRoom(room)}
                          className="btn btn-ghost size-10 min-h-0 px-0"
                          title="Edytuj kanał i kod dostępu"
                        >
                          <Icon name="gear" className="size-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyInvite(room)}
                        className="btn btn-ghost size-10 min-h-0 px-0"
                        title="Kopiuj link"
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
            <h3 className="font-display text-2xl tracking-wide mb-1">Edycja pokoju</h3>
            <p className="text-sm text-mute mb-4">Zaktualizuj nazwę, opis oraz prywatność pokoju.</p>

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
                  className="size-4 accent-lime rounded cursor-pointer"
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
                <button
                  type="submit"
                  disabled={savingRoom}
                  className="btn btn-primary"
                >
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
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-line bg-panel p-6 shadow-2xl max-h-[90vh] flex flex-col justify-between overflow-hidden">
            <div>
              <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
                <div>
                  <h3 className="font-display text-2xl tracking-wide">
                    Uczestnicy pokoju
                  </h3>
                  <p className="text-xs text-mute font-mono">Pokój: #{managingMembersRoom.name}</p>
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
                  <button type="submit" className="btn btn-primary min-h-10 px-4 text-xs uppercase font-semibold">
                    Dodaj
                  </button>
                </div>

                {memberActionMsg && (
                  <div className="flex items-center gap-1.5 text-xs text-lime font-mono">
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{memberActionMsg}</span>
                  </div>
                )}
                {memberActionError && (
                  <div className="flex items-center gap-1.5 text-xs text-danger font-mono">
                    <Icon name="alert" className="size-4 shrink-0" />
                    <span>{memberActionError}</span>
                  </div>
                )}
              </form>

              <div className="space-y-2">
                <span className="label">Lista członków ({members.length})</span>
                {loadingMembers ? (
                  <p className="text-xs text-mute py-4 text-center">Ładowanie członków...</p>
                ) : members.length === 0 ? (
                  <p className="text-xs text-mute py-4 text-center">Brak dodanych członków.</p>
                ) : (
                  <ul className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-line/60">
                    {members.map((member) => {
                      const isOwner = member.role === 'owner';
                      const isMod = member.role === 'moderator';

                      return (
                        <li key={member.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            {member.profiles?.avatar_url ? (
                              <img
                                src={member.profiles.avatar_url}
                                alt=""
                                className="size-8 rounded-full border border-line object-cover"
                              />
                            ) : (
                              <div className="font-display flex size-8 items-center justify-center rounded-full bg-line text-xs uppercase font-bold">
                                {(member.profiles?.username || 'U')[0]}
                              </div>
                            )}

                            <div>
                              <p className="text-sm font-semibold text-paper">
                                {member.profiles?.username || 'Użytkownik'}
                              </p>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                isOwner
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : isMod
                                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                  : 'bg-line/30 border-line text-mute'
                              }`}>
                                {member.role}
                              </span>
                            </div>
                          </div>

                          {!isOwner && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleModeratorRole(member)}
                                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                                  isMod
                                    ? 'bg-blue-950/60 border-blue-700 text-blue-300'
                                    : 'bg-panel border-line text-mute hover:text-paper'
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

            <div className="pt-4 border-t border-line flex justify-end">
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
                <h2 className="font-display text-3xl tracking-wide">
                  Ustawienia konta
                </h2>
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
                  <div role="status" className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime/10 p-2.5 text-sm text-lime">
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{profileMsg}</span>
                  </div>
                )}

                {profileError && (
                  <div role="alert" className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger">
                    <Icon name="alert" className="size-4 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <span className="label">Awatar</span>
                    <div className="flex items-center gap-3">
                      {newAvatarUrl ? (
                        <img
                          src={newAvatarUrl}
                          alt="Podgląd awatara"
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
                  <div role="status" className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime/10 p-2.5 text-sm text-lime">
                    <Icon name="check" className="size-4 shrink-0" />
                    <span>{passwordMsg}</span>
                  </div>
                )}

                {passwordError && (
                  <div role="alert" className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger">
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