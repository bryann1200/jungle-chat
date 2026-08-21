import { useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { JungleAvatar } from "./Avatar";

export function NewChatModal({
  me,
  people,
  onClose,
  onCreated,
}: {
  me: string;
  people: Profile[];
  onClose: () => void;
  onCreated: (chatId: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGroup = selected.length > 1;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function create() {
    if (selected.length === 0) return;
    if (isGroup && !groupName.trim()) {
      setError("Give your troop a name!");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: chat, error: cErr } = await supabase
        .from("chatapp_chats")
        .insert({
          is_group: isGroup,
          name: isGroup ? groupName.trim() : null,
          created_by: me,
        })
        .select()
        .single();
      if (cErr) throw cErr;
      const rows = [me, ...selected].map((user_id) => ({ chat_id: chat.id, user_id }));
      const { error: pErr } = await supabase.from("chatapp_chat_participants").insert(rows);
      if (pErr) throw pErr;
      onCreated(chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start chat");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bark/50 p-0 sm:items-center sm:p-4">
      <div className="card-bubbly flex max-h-[85vh] w-full max-w-sm flex-col gap-3 p-5">
        <h2 className="text-2xl font-extrabold text-bark">🙈 New chat</h2>
        <p className="text-sm text-muted-foreground">
          Pick one monkey for a direct chat, or several for a group.
        </p>

        <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
          {people.length === 0 && (
            <p className="text-sm text-muted-foreground">No other monkeys yet 🍌</p>
          )}
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border-[3px] border-bark px-3 py-2 text-left font-bold text-bark ${
                selected.includes(p.id) ? "bg-banana" : "bg-cream"
              }`}
            >
              <JungleAvatar name={p.username} color={p.avatar_color} size={36} />
              <span className="flex-1 truncate">{p.username}</span>
              {selected.includes(p.id) && <span>✅</span>}
            </button>
          ))}
        </div>

        {isGroup && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name, e.g. Banana Squad"
            className="w-full rounded-2xl border-[3px] border-bark bg-cream px-4 py-2.5 outline-none focus:border-jungle"
          />
        )}

        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => void create()}
            disabled={busy || selected.length === 0}
            className="flex-1 rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 font-extrabold text-bark disabled:opacity-50"
            style={{ boxShadow: "var(--shadow-bubbly)" }}
          >
            {busy ? "Creating..." : "Start chatting"}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border-[3px] border-bark bg-cream px-4 py-2.5 font-bold text-bark"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
