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

export type Profile = {
  id: string;
  username: string;
  avatar_color: string | null;
};

export type Chat = {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string;
  created_at: string;
};

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
};
