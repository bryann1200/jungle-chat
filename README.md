# Jungle Chat

Build a real-time chat web app in React + Supabase, cartoon monkey/banana jungle theme.

BACKEND — already exists, do not create/modify tables, storage, or RLS:

- Supabase URL: https://zvolgtrwquxfwfkygnfp.supabase.co

- Publishable key: sb_publishable_ogcWUT6QqygBauZmIE1zjw_S_q6qbxh

- Tables:

  - chatapp_profiles (id uuid PK → auth.users, username text, avatar_color text, created_at)

  - chatapp_chats (id uuid PK, is_group boolean, name text nullable, created_by uuid, created_at)

  - chatapp_chat_participants (chat_id uuid, user_id uuid, joined_at, last_read_at) — composite PK

  - chatapp_messages (id uuid PK, chat_id uuid, sender_id uuid, content text, created_at)

  - chatapp_settings (id boolean PK always true, background_url text nullable, updated_by uuid, updated_at) — single row, holds the custom login/landing background image URL

- Storage bucket "chatapp-backgrounds" already exists, public read, authenticated write.

- Realtime already enabled on chatapp_messages via postgres_changes.

- Auth: Supabase email/password (auth.signUp / signInWithPassword). On signup, also insert into chatapp_profiles with id = new user's id and chosen username.

FEATURES:

1. Auth screens (sign up: email, password, username; sign in: email, password).

2. Landing/login page background: default is a tiled/scattered pattern of jungle emojis (🐵🍌🌴🙈🙉🙊🌿) as a subtle repeating CSS background behind the auth form. If chatapp_settings.background_url is set, use that image as the background instead (cover, dimmed slightly so the form stays readable), fetched on load from chatapp_settings.

3. Admin panel: a settings/gear icon in the header (visible to any signed-in user, no role restriction needed) that opens a modal to upload an image to the "chatapp-backgrounds" bucket, then update chatapp_settings.background_url with the public URL. Include a "reset to default emoji background" button that sets background_url back to null.

4. Sidebar: list of user's chats sorted by most recent message — avatar (initials, colored by username hash), display name (other user's username for 1-1, chat name/member list for group), last message preview.

5. "New chat" flow: pick one user for direct chat, or multiple + group name for group chat.

6. Chat pane: scrollable history, sender name shown only in group chats, timestamps, auto-scroll to latest.

7. Optimistic sending: insert message into local state immediately on send, before the Supabase insert resolves; reconcile with confirmed row after, roll back with inline error on failure. Never wait on network round-trip to show my own sent message.

8. Subscribe to chatapp_messages via realtime, filtered by chat_id, for incoming messages.

9. Sign out button.

DESIGN — cartoon monkey/banana jungle theme:

- Palette: banana yellow (#FFD93D), jungle green, warm brown, cream background.

- Rounded bubbly cartoon UI, thick friendly borders, soft shadows, playful rounded font (Baloo 2 or Fredoka from Google Fonts).

- Message bubbles with banana/leaf motifs; sent = banana yellow, received = soft jungle green.

- Monkey mascot/emoji in header and empty states ("🐵 No chats yet — go bananas and start one!").

- Avatars as circular banana-yellow/brown badges with initials.

- Send button styled like a banana or paw icon.

- Clean, readable, mobile-friendly responsive layout — playful but not cluttered.

Do not add any other backend services, edge functions, or tables — everything routes through the Supabase project above.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c1a3f0fb-965e-4040-809c-353fc683a716).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
