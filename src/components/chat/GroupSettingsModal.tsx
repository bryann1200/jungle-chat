import { useEffect, useState } from "react";
import { supabase, type Chat, type Profile } from "@/lib/supabase";
import { JungleAvatar } from "./Avatar";

type Props = {
  chat: Chat & { memberIds: string[] };
  profiles: Record<string, Profile>;
  userId: string;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
};

export function GroupSettingsModal({
  chat,
  profiles,
  userId,
  onClose,
  onChanged,
  onLeft,
}: Props) {
  const isOwner = chat.created_by === userId;
  const [name, setName] = useState(chat.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("chatapp_profiles")
        .select("*")
        .ilike("username", `%${q}%`)
        .limit(10);
      if (cancelled) return;
      setResults(
        ((data ?? []) as Profile[]).filter((p) => !chat.memberIds.includes(p.id)),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, chat.memberIds]);

  async function saveName() {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase
      .from("chatapp_chats")
      .update({ name: name.trim() || null })
      .eq("id", chat.id);
    setBusy(false);
    if (err) return setError(err.message);
    setNote("Group name updated! 🌴");
    onChanged();
  }

  async function addMember(id: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("chatapp_chat_participants")
      .insert({ chat_id: chat.id, user_id: id });
    setBusy(false);
    if (err) return setError(err.message);
    setQuery("");
    setResults([]);
    setNote("Monkey added to the troop! 🐵");
    onChanged();
  }

  async function removeMember(id: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("chatapp_chat_participants")
      .delete()
      .eq("chat_id", chat.id)
      .eq("user_id", id);
    setBusy(false);
    if (err) return setError(err.message);
    if (id === userId) {
      onChanged();
      onLeft();
      onClose();
      return;
    }
    setNote("Member removed.");
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/50 p-4">
      <div className="card-bubbly flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b-[3px] border-bark bg-banana px-4 py-3">
          <h2 className="flex-1 text-xl font-extrabold text-bark">🌴 Group settings</h2>
          <button
            onClick={onClose}
            aria-label="Close group settings"
            className="rounded-full border-[3px] border-bark bg-cream px-3 py-1 font-bold text-bark"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <JungleAvatar name={chat.name || "Group"} emoji="🌴" size={56} />
            <p className="text-sm text-muted-foreground">
              {chat.memberIds.length} monkeys in this troop
            </p>
          </div>

          <label className="block text-sm font-extrabold text-bark">
            Group name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              disabled={!isOwner}
              placeholder="Banana Squad"
              className="mt-1 w-full rounded-full border-[3px] border-bark bg-card px-4 py-2 font-normal outline-none focus:border-jungle disabled:opacity-60"
            />
          </label>
          {isOwner ? (
            <button
              onClick={() => void saveName()}
              disabled={busy}
              className="w-full rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 font-extrabold text-bark"
              style={{ boxShadow: "var(--shadow-bubbly)" }}
            >
              Save group details
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              🍌 Only the group creator can rename the group or remove members.
            </p>
          )}

          <div>
            <p className="text-sm font-extrabold text-bark">👥 Members</p>
            <div className="mt-2 space-y-2">
              {chat.memberIds.map((id) => {
                const p = profiles[id];
                const owner = id === chat.created_by;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-2xl border-[3px] border-bark bg-card px-3 py-2"
                  >
                    <JungleAvatar
                      name={p?.username ?? "monkey"}
                      color={p?.avatar_color ?? null}
                      imageUrl={p?.avatar_url ?? null}
                      emoji={p?.status_emoji || undefined}
                      size={34}
                    />
                    <span className="min-w-0 flex-1 truncate font-bold text-bark">
                      {p?.username ?? "monkey"}
                      {id === userId ? " (you)" : ""}
                    </span>
                    {owner && (
                      <span className="rounded-full border-2 border-bark bg-banana px-2 py-0.5 text-xs font-extrabold text-bark">
                        Admin
                      </span>
                    )}
                    {!owner && (isOwner || id === userId) && (
                      <button
                        onClick={() => void removeMember(id)}
                        disabled={busy}
                        className="rounded-full border-[3px] border-bark bg-cream px-2 py-0.5 text-xs font-bold text-bark"
                      >
                        {id === userId ? "Leave" : "Remove"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-extrabold text-bark">➕ Add monkeys</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username..."
              className="mt-1 w-full rounded-full border-[3px] border-bark bg-card px-4 py-2 outline-none focus:border-jungle"
            />
            <div className="mt-2 space-y-2">
              {results
                .filter((p) => p.id !== userId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void addMember(p.id)}
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-2xl border-[3px] border-bark bg-cream px-3 py-2 text-left"
                  >
                    <JungleAvatar
                      name={p.username}
                      color={p.avatar_color}
                      imageUrl={p.avatar_url ?? null}
                      emoji={p.status_emoji || undefined}
                      size={30}
                    />
                    <span className="min-w-0 flex-1 truncate font-bold text-bark">
                      {p.username}
                    </span>
                    <span className="font-extrabold text-jungle">Add</span>
                  </button>
                ))}
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          {note && <p className="text-sm font-bold text-jungle">{note}</p>}
        </div>
      </div>
    </div>
  );
}
