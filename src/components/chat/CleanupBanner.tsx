import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const DISMISS_KEY = "junglechat_cleanup_dismissed";

/** True when today is within the 7 days immediately before the 1st of next month. */
export function inCleanupWindow(now = new Date()) {
  const firstNextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 3, 0, 0);
  const days = (firstNextMonth - now.getTime()) / 86_400_000;
  return days > 0 && days <= 7;
}

type AtRisk = { id: string; image_url: string; created_at: string };

export function CleanupBanner({ chatIds }: { chatIds: string[] }) {
  const [photos, setPhotos] = useState<AtRisk[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (dismissed || chatIds.length === 0 || !inCleanupWindow()) return;
    const cutoff = new Date(Date.now() - 23 * 86_400_000).toISOString();
    let cancelled = false;
    void supabase
      .from("chatapp_messages")
      .select("id, image_url, created_at")
      .in("chat_id", chatIds)
      .not("image_url", "is", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setPhotos((data ?? []) as AtRisk[]);
      });
    return () => {
      cancelled = true;
    };
  }, [chatIds, dismissed]);

  if (dismissed || photos.length === 0) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="border-b-[3px] border-bark bg-mango/40 px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left font-bold text-bark"
        >
          🍌🙈 Heads up! {photos.length} photo{photos.length === 1 ? "" : "s"} will be cleared out
          in the next cleanup on the 1st — save anything you want to keep!
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss cleanup warning"
          className="rounded-full border-[3px] border-bark bg-cream px-2.5 py-0.5 font-extrabold text-bark"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p) => (
            <a
              key={p.id}
              href={p.image_url}
              download
              target="_blank"
              rel="noreferrer"
              title="Download photo"
              className="block h-20 w-20 overflow-hidden rounded-xl border-[3px] border-bark"
            >
              <img
                src={p.image_url}
                alt="Photo scheduled for cleanup"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
