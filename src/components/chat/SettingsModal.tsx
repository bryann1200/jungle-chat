import { useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { JungleAvatar } from "./Avatar";

const BUCKET = "chatapp-backgrounds";
const STATUS_EMOJIS = ["🐵", "🍌", "🌴", "🙈", "🔥", "😴", "🎉", "🥥"];
const COLORS = [
  "var(--banana)",
  "var(--jungle)",
  "var(--leaf)",
  "var(--mango)",
  "var(--bark)",
];

type Tab = "profile" | "backdrop" | "danger";

export function SettingsModal({
  userId,
  profile,
  onClose,
  onSaved,
  onProfileSaved,
  onNuked,
}: {
  userId: string;
  profile: Profile | undefined;
  onClose: () => void;
  onSaved: (url: string | null) => void;
  onProfileSaved: () => void;
  onNuked: () => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [statusEmoji, setStatusEmoji] = useState(profile?.status_emoji ?? "");
  const [avatarColor, setAvatarColor] = useState(profile?.avatar_color ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url ?? null);
  const [muteAll, setMuteAll] = useState(profile?.notification_prefs?.mute_all ?? false);
  const [soundEnabled, setSoundEnabled] = useState(
    profile?.notification_prefs?.sound_enabled ?? true,
  );
  const [confirmNuke, setConfirmNuke] = useState("");

  async function uploadBanner(file: File) {
    setBusy(true);
    setError(null);
    try {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("chatapp-banners")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("chatapp-banners").getPublicUrl(path).data.publicUrl;
      const { error: dbErr } = await supabase
        .from("chatapp_profiles")
        .update({ banner_url: url })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      setBannerUrl(url);
      setNote("Banner updated! 🌴");
      onProfileSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setBusy(false);
  }

  async function saveNotifications(next: { mute_all?: boolean; sound_enabled?: boolean }) {
    setError(null);
    const { data } = await supabase
      .from("chatapp_profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    const current = ((data?.notification_prefs ?? {}) as Record<string, unknown>) || {};
    const merged = { ...current, ...next };
    const { error: err } = await supabase
      .from("chatapp_profiles")
      .update({ notification_prefs: merged })
      .eq("id", userId);
    if (err) return setError(err.message);
    onProfileSaved();
  }

  async function uploadTo(prefix: string, file: File) {
    const path = `${prefix}/${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function uploadBackground(file: File) {
    setBusy(true);
    setError(null);
    try {
      await saveBackground(await uploadTo("backgrounds", file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    setError(null);
    try {
      setAvatarUrl(await uploadTo("avatars", file));
      setNote("Photo uploaded — hit Save profile 🍌");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setBusy(false);
  }

  async function saveBackground(url: string | null) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("chatapp_settings").upsert({
      id: true,
      background_url: url,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (err) return setError(err.message);
    onSaved(url);
    onClose();
  }

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase
      .from("chatapp_profiles")
      .update({
        username: username.trim() || "monkey",
        bio: bio.trim() || null,
        status_emoji: statusEmoji || null,
        avatar_color: avatarColor || null,
        avatar_url: avatarUrl,
      })
      .eq("id", userId);
    setBusy(false);
    if (err) return setError(err.message);
    setNote("Profile saved! 🐵");
    onProfileSaved();
  }

  async function nuke() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { data: parts } = await supabase
        .from("chatapp_chat_participants")
        .select("chat_id")
        .eq("user_id", userId);
      const ids = (parts ?? []).map((p) => p.chat_id as string);
      if (ids.length === 0) {
        setNote("Nothing to nuke — your jungle is already empty.");
        setBusy(false);
        return;
      }
      const { data: myMsgs } = await supabase
        .from("chatapp_messages")
        .select("id")
        .in("chat_id", ids)
        .eq("sender_id", userId);
      const msgIds = (myMsgs ?? []).map((m) => m.id as string);
      if (msgIds.length) {
        await supabase.from("chatapp_message_reactions").delete().in("message_id", msgIds);
        await supabase.from("chatapp_messages").delete().in("id", msgIds);
      }
      await supabase.from("chatapp_messages").delete().in("chat_id", ids);
      await supabase
        .from("chatapp_chat_participants")
        .delete()
        .eq("user_id", userId)
        .in("chat_id", ids);
      const { error: chatErr } = await supabase
        .from("chatapp_chats")
        .delete()
        .in("id", ids)
        .eq("created_by", userId);
      if (chatErr) throw chatErr;
      setBusy(false);
      onNuked();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Nuke failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/50 p-4">
      <div className="card-bubbly flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b-[3px] border-bark bg-banana px-4 py-3">
          <h2 className="flex-1 text-xl font-extrabold text-bark">⚙️ Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full border-[3px] border-bark bg-cream px-3 py-1 font-bold text-bark"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 border-b-[3px] border-bark p-2">
          {(
            [
              ["profile", "🐵 Profile"],
              ["backdrop", "🌴 Backdrop"],
              ["danger", "💣 Nuke"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setError(null);
                setNote(null);
              }}
              className={`flex-1 rounded-full border-[3px] border-bark px-2 py-1.5 text-sm font-extrabold text-bark ${
                tab === key ? "bg-banana" : "bg-card"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {tab === "profile" && (
            <>
              <div className="flex items-center gap-4">
                <JungleAvatar
                  name={username || "monkey"}
                  color={avatarColor || null}
                  imageUrl={avatarUrl}
                  size={72}
                />
                <div className="space-y-2">
                  <label className="block cursor-pointer rounded-full border-[3px] border-bark bg-leaf px-3 py-1.5 text-sm font-bold text-bark">
                    {busy ? "Uploading..." : "📷 Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAvatar(f);
                      }}
                    />
                  </label>
                  {avatarUrl && (
                    <button
                      onClick={() => setAvatarUrl(null)}
                      className="rounded-full border-[3px] border-bark bg-card px-3 py-1 text-sm font-bold text-bark"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              <label className="block text-sm font-extrabold text-bark">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={32}
                  className="mt-1 w-full rounded-full border-[3px] border-bark bg-card px-4 py-2 font-normal outline-none focus:border-jungle"
                />
              </label>

              <label className="block text-sm font-extrabold text-bark">
                Bio
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  maxLength={160}
                  placeholder="Just a monkey with a plan 🍌"
                  className="mt-1 w-full resize-none rounded-2xl border-[3px] border-bark bg-card px-4 py-2 font-normal outline-none focus:border-jungle"
                />
              </label>

              <div>
                <p className="text-sm font-extrabold text-bark">Status</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {STATUS_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setStatusEmoji(statusEmoji === e ? "" : e)}
                      className={`rounded-full border-[3px] border-bark px-2.5 py-1 text-lg ${
                        statusEmoji === e ? "bg-mango" : "bg-card"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-extrabold text-bark">Avatar colour</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAvatarColor(avatarColor === c ? "" : c)}
                      aria-label={`Pick colour ${c}`}
                      className={`size-9 rounded-full border-[3px] ${
                        avatarColor === c ? "border-jungle" : "border-bark"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => void saveProfile()}
                disabled={busy}
                className="w-full rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 font-extrabold text-bark"
                style={{ boxShadow: "var(--shadow-bubbly)" }}
              >
                Save profile
              </button>
            </>
          )}

          {tab === "backdrop" && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a background image for the sign-in screen, or go back to the emoji jungle.
              </p>
              <label className="block cursor-pointer rounded-2xl border-[3px] border-dashed border-bark bg-cream px-4 py-6 text-center font-bold text-bark">
                {busy ? "Uploading..." : "📷 Choose an image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadBackground(f);
                  }}
                />
              </label>
              <button
                onClick={() => void saveBackground(null)}
                disabled={busy}
                className="w-full rounded-full border-[3px] border-bark bg-leaf px-3 py-2 font-bold text-bark"
              >
                Reset to emojis
              </button>
            </>
          )}

          {tab === "danger" && (
            <>
              <p className="text-lg font-extrabold text-bark">💣 Nuke all chats</p>
              <p className="text-sm text-muted-foreground">
                This instantly removes you from every chat and deletes your messages. Chats you
                created are deleted for everyone. This cannot be undone.
              </p>
              <input
                value={confirmNuke}
                onChange={(e) => setConfirmNuke(e.target.value)}
                placeholder="Type NUKE to confirm"
                className="w-full rounded-full border-[3px] border-bark bg-card px-4 py-2 outline-none focus:border-destructive"
              />
              <button
                onClick={() => void nuke()}
                disabled={busy || confirmNuke.trim().toUpperCase() !== "NUKE"}
                className="w-full rounded-full border-[3px] border-bark bg-destructive px-4 py-2.5 font-extrabold text-destructive-foreground disabled:opacity-50"
                style={{ boxShadow: "var(--shadow-bubbly)" }}
              >
                {busy ? "Nuking..." : "💥 Nuke everything"}
              </button>
            </>
          )}

          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          {note && <p className="text-sm font-bold text-jungle">{note}</p>}
        </div>
      </div>
    </div>
  );
}
