import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zvolgtrwquxfwfkygnfp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ogcWUT6QqygBauZmIE1zjw_S_q6qbxh";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  },
});

export type NotificationPrefs = {
  mute_all?: boolean;
  sound_enabled?: boolean;
};

export type Profile = {
  id: string;
  username: string;
  avatar_color: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  status_emoji?: string | null;
  notification_prefs?: NotificationPrefs | null;
};

export type Nickname = {
  chat_id: string;
  set_by: string;
  target_user_id: string;
  nickname: string;
};

export type Chat = {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string;
  created_at: string;
};

export type Participant = {
  chat_id: string;
  user_id: string;
  last_read_at: string | null;
};

export type Reaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  /** local object URL used while an image upload is in flight */
  localUrl?: string;
  /** kept in memory so a failed photo send can be retried */
  file?: File;
};

