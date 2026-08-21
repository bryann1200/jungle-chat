import { hashColor, initials } from "@/lib/chat-utils";

export function JungleAvatar({
  name,
  color,
  size = 44,
  emoji,
  imageUrl,
}: {
  name: string;
  color?: string | null | undefined;
  size?: number | undefined;
  emoji?: string | undefined;
  imageUrl?: string | null | undefined;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-bark font-bold text-bark"
      style={{
        width: size,
        height: size,
        background: color || hashColor(name),
        fontSize: size * 0.36,
        boxShadow: "var(--shadow-soft)",
      }}
      aria-hidden
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        (emoji ?? initials(name || "??"))
      )}
    </div>
  );
}
