export class WebhookResponseDto {
  id: string;
  type: number;
  guild_id?: string;
  channel_id: string;
  name: string;
  avatar: string | null;
  token?: string;
  application_id: string | null;
  url?: string;
}

export class WebhooksResponseDto {
  webhooks: WebhookResponseDto[];
}
