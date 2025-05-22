export type Done = (err: Error | null, user: any) => void;

type ChannelType = 0 | 2 | 4; // 0 = Text, 2 = Voice, 4 = Category

type IconEmoji = {
  id: string | null;
  name: string;
};

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string; // Or string, if it can vary, though "Bearer" is standard for OAuth2
  expires_in: number;
  refresh_token: string;
  scope: string; // Could be a union of known scope strings if you want stricter typing, e.g., "identify" | "guilds" | "email"
}

type PermissionOverwrite = {
  id: string;
  type: number;
  allow: string;
  deny: string;
};

export type Channel = {
  id: string;
  type: ChannelType;
  guild_id: string;
  name: string;
  position: number;
  parent_id: string | null;
  flags: number;
  permission_overwrites: PermissionOverwrite[];

  // Optional (depends on type)
  topic?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number;
  last_message_id?: string | null;

  // Voice-specific
  bitrate?: number;
  user_limit?: number;
  rtc_region?: string | null;
  icon_emoji?: IconEmoji | null;
  theme_color?: number | null;
  voice_background_display?: unknown;
};

export interface Webhook {
  application_id: string | null;
  avatar: string | null;
  channel_id: string;
  guild_id: string;
  id: string;
  name: string;
  type: number;
  user: DiscordUser;
  token: string;
  url: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  public_flags: number;
  flags: number;
  bot?: boolean;
  banner: null;
  accent_color: null;
  global_name: string | null;
  avatar_decoration_data: null;
  collectibles: null;
  banner_color: null;
  clan: null;
  primary_guild: null;
}
