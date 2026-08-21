import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function SettingsModal({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("chatapp-backgrounds")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("chatapp-backgrounds").getPublicUrl(path);
      await save(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  async function save(url: string | null) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("chatapp_settings")
      .upsert({ id: true, background_url: url, updated_by: userId, updated_at: new Date().toISOString() });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(url);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/50 p-4">
      <div className="card-bubbly w-full max-w-sm space-y-4 p-6">
        <h2 className="text-2xl font-extrabold text-bark">🌴 Jungle backdrop</h2>
        <p className="text-sm text-muted-foreground">
          Upload a background image for the sign-in screen, or go back to the emoji jungle.
        </p>

        <label
          className="block cursor-pointer rounded-2xl border-[3px] border-dashed border-bark bg-cream px-4 py-6 text-center font-bold text-bark"
        >
          {busy ? "Uploading..." : "📷 Choose an image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>

        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => void save(null)}
            disabled={busy}
            className="flex-1 rounded-full border-[3px] border-bark bg-leaf px-3 py-2 font-bold text-bark"
          >
            Reset to emojis
          </button>
          <button
            onClick={onClose}
            className="rounded-full border-[3px] border-bark bg-cream px-4 py-2 font-bold text-bark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
