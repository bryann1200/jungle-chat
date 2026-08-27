import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from "livekit-client";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";

type CallState = "ringing-out" | "ringing-in" | "connecting" | "in-call" | "ended" | "error";

export function CallModal({
  chatId,
  otherProfile,
  mode,
  onClose,
}: {
  chatId: string;
  otherProfile: Profile | undefined;
  /** "outgoing" if I tapped Call, "incoming" if I'm receiving a ring */
  mode: "outgoing" | "incoming";
  onClose: () => void;
}) {
  const [state, setState] = useState<CallState>(mode === "outgoing" ? "ringing-out" : "ringing-in");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const connect = async () => {
    setState("connecting");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not signed in");

      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { chatId },
      });
      if (error || !data?.token) throw new Error(error?.message || "Could not start call");

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        }
      });
      room.on(RoomEvent.ParticipantDisconnected, (_p: RemoteParticipant) => {
        setState("ended");
      });
      room.on(RoomEvent.Disconnected, () => {
        setState((s) => (s === "in-call" ? "ended" : s));
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.enableCameraAndMicrophone();
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track && localVideoRef.current) {
        camPub.track.attach(localVideoRef.current);
      }
      setState("in-call");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Call failed");
      setState("error");
    }
  };

  useEffect(() => {
    if (mode === "outgoing") void connect();
    return () => {
      roomRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangUp = () => {
    roomRef.current?.disconnect();
    onClose();
  };

  const accept = () => void connect();
  const decline = () => onClose();

  const name = otherProfile?.username ?? "monkey";

  return (
    <div
      role="dialog"
      aria-label="Call"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bark/90 p-4"
    >
      {(state === "ringing-out" || state === "ringing-in" || state === "connecting") && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border-[3px] border-banana bg-cream px-8 py-10 text-center">
          <span className="text-5xl">🐵</span>
          <p className="text-xl font-extrabold text-bark">{name}</p>
          <p className="font-bold text-bark/70">
            {state === "ringing-out" && "Calling..."}
            {state === "ringing-in" && "Incoming call 📹"}
            {state === "connecting" && "Connecting..."}
          </p>
          <div className="mt-2 flex gap-4">
            {state === "ringing-in" ? (
              <>
                <button
                  onClick={decline}
                  className="rounded-full border-[3px] border-bark bg-cream px-6 py-2 font-bold text-bark"
                >
                  Decline
                </button>
                <button
                  onClick={accept}
                  className="rounded-full border-[3px] border-bark bg-jungle px-6 py-2 font-bold text-cream"
                >
                  Accept
                </button>
              </>
            ) : (
              <button
                onClick={hangUp}
                className="rounded-full border-[3px] border-bark bg-cream px-6 py-2 font-bold text-bark"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {state === "in-call" && (
        <div className="relative flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full rounded-3xl border-[3px] border-banana bg-black"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-20 right-4 h-28 w-20 rounded-2xl border-[3px] border-banana bg-black object-cover"
          />
          <button
            onClick={hangUp}
            aria-label="Hang up"
            className="mt-2 rounded-full border-[3px] border-bark bg-red-400 px-8 py-3 text-lg font-bold text-cream"
          >
            📴 Hang up
          </button>
        </div>
      )}

      {(state === "ended" || state === "error") && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border-[3px] border-banana bg-cream px-8 py-10 text-center">
          <span className="text-4xl">🍌</span>
          <p className="font-bold text-bark">
            {state === "error" ? errorMsg ?? "Call failed" : "Call ended"}
          </p>
          <button
            onClick={onClose}
            className="rounded-full border-[3px] border-bark bg-cream px-6 py-2 font-bold text-bark"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
