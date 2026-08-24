import type { Profile } from "@/lib/supabase";
import { JungleAvatar } from "./Avatar";

export function ProfileModal({
  profile,
  nickname,
  onClose,
}: {
  profile: Profile | undefined;
  nickname?: string | null | undefined;
  onClose: () => void;
}) {
  if (!profile) return null;
  return (
    <div
      role="dialog"
      aria-label={`${profile.username} profile`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bark/50 p-4"
      onClick={onClose}
    >
      <div
        className="card-bubbly w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {profile.banner_url ? (
            <img
              src={profile.banner_url}
              alt={`${profile.username} cover banner`}
              className="h-28 w-full border-b-[3px] border-bark object-cover"
            />
          ) : (
            <div className="flex h-28 w-full items-center justify-center border-b-[3px] border-bark bg-leaf text-4xl">
              🌴
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close profile"
            className="absolute right-3 top-3 rounded-full border-[3px] border-bark bg-cream px-3 py-1 font-bold text-bark"
          >
            ✕
          </button>
        </div>

        <div className="-mt-10 flex flex-col items-center gap-2 px-5 pb-6">
          <div className="relative">
            <JungleAvatar
              name={profile.username}
              color={profile.avatar_color}
              imageUrl={profile.avatar_url ?? null}
              size={84}
            />
            {profile.status_emoji && (
              <span className="absolute -bottom-1 -right-1 rounded-full border-[3px] border-bark bg-cream px-1.5 text-lg">
                {profile.status_emoji}
              </span>
            )}
          </div>
          <p className="text-xl font-extrabold text-bark">
            {nickname || profile.username}
          </p>
          {nickname && (
            <p className="-mt-1 text-sm text-muted-foreground">@{profile.username}</p>
          )}
          {profile.bio ? (
            <p className="text-center text-sm text-bark">{profile.bio}</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Just a mysterious monkey 🙈
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
