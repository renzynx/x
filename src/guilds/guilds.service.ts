import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProfileGuild } from 'passport-discord-auth';
import { AuthService } from 'src/auth/auth.service';
import { db, User, users } from 'src/db';
import { DEFAULT_WEBHOOK_AVATAR } from 'src/lib/constants';
import {
  generateGoofyAhhName,
  guildsWithAdmin,
  textChannels,
} from 'src/lib/utils';
import { Channel, Webhook } from 'src/types';

@Injectable()
export class GuildsService {
  private readonly botToken: string = '';

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly authService: AuthService,
  ) {
    this.botToken = this.configService.getOrThrow('DISCORD_BOT_TOKEN');
  }

  // Generate cache keys
  generateGuildsCacheKey(userId: string): string {
    return `guilds:${userId}`;
  }

  generateChannelsCacheKey(guildId: string): string {
    return `channels:${guildId}`;
  }

  generateWebhooksCacheKey(channelId: string): string {
    return `webhooks:${channelId}`;
  }

  async getGuilds(user: User, sync: boolean): Promise<ProfileGuild[]> {
    const cacheKey = this.generateGuildsCacheKey(user.id);
    let accessToken = user.access_token;

    if (user.token_expiry.getTime() < Date.now()) {
      try {
        const { access_token, refresh_token, expires_in } =
          await this.authService.refreshToken(user.refresh_token);

        await db.update(users).set({
          access_token,
          refresh_token,
          token_expiry: new Date(Date.now() + expires_in * 1000),
        });

        accessToken = access_token;
      } catch (error) {
        console.log(error);
        throw new InternalServerErrorException('Cannot refresh token');
      }
    }

    if (!sync) {
      const cachedGuilds = await this.cacheManager.get<string>(cacheKey);

      if (cachedGuilds) {
        console.log('hit');
        return JSON.parse(cachedGuilds);
      }
    }

    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch guilds: ${response.statusText}`);
    }

    const guilds = await response.json();

    const filteredGuilds = guildsWithAdmin(guilds);

    // Cache the result
    await this.cacheManager.set(cacheKey, JSON.stringify(filteredGuilds));

    return filteredGuilds;
  }

  async getGuild(guild_id: string): Promise<ProfileGuild> {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guild_id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new HttpException((await response.json()).message, response.status);
    }

    const guild = await response.json();

    if (!guild) {
      throw new ForbiddenException('Guild not found');
    }

    return guild;
  }

  async getGuildChannels(
    guild_id: string,
  ): Promise<{ guild: ProfileGuild; channels: Channel[] }> {
    const cacheKey = this.generateChannelsCacheKey(guild_id);
    const cachedChannels = await this.cacheManager.get<string>(cacheKey);
    const guild = await this.getGuild(guild_id);

    if (cachedChannels) {
      return {
        channels: JSON.parse(cachedChannels),
        guild,
      };
    }

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guild_id}/channels`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new HttpException((await response.json()).message, response.status);
    }

    const channels = await response.json();
    const filteredChannels = textChannels(channels);

    // Cache the result
    await this.cacheManager.set(cacheKey, JSON.stringify(filteredChannels));

    return {
      guild,
      channels: filteredChannels,
    };
  }

  async createWebhook({
    channel_id,
    name,
    avatar,
  }: {
    channel_id: string;
    name?: string;
    avatar?: string;
  }): Promise<Webhook> {
    const webhooks = await this.getWebhooks(channel_id);

    if (webhooks.length === 15) {
      throw new BadRequestException('Maximum number of webhooks reached (15)');
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channel_id}/webhooks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name || generateGoofyAhhName(),
          avatar: avatar ? avatar : DEFAULT_WEBHOOK_AVATAR,
        }),
      },
    );

    if (!response.ok) {
      throw new HttpException((await response.json()).message, response.status);
    }

    // Invalidate the webhooks cache for this channel since we added a new webhook
    const cacheKey = this.generateWebhooksCacheKey(channel_id);
    await this.cacheManager.del(cacheKey);

    return response.json();
  }

  async getWebhooks(channel_id: string): Promise<Webhook[]> {
    const cacheKey = this.generateWebhooksCacheKey(channel_id);
    const cachedWebhooks = await this.cacheManager.get<string>(cacheKey);

    if (cachedWebhooks) {
      return JSON.parse(cachedWebhooks);
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channel_id}/webhooks`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new HttpException((await response.json()).message, response.status);
    }

    const webhooks = await response.json();

    // Cache the result
    await this.cacheManager.set(cacheKey, JSON.stringify(webhooks));

    return webhooks;
  }

  async deleteWebhook(webhook_id: string): Promise<void> {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${webhook_id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new HttpException((await response.json()).message, response.status);
    }

    // Note: We can't invalidate the webhooks cache directly here since we don't have the channel_id
    // The caller will need to call clearWebhooksCache with the appropriate channel_id if needed
  }

  // Cache utility methods for external use
  async clearGuildsCache(userId: string): Promise<void> {
    const cacheKey = this.generateGuildsCacheKey(userId);
    await this.cacheManager.del(cacheKey);
  }

  async clearChannelsCache(guildId: string): Promise<void> {
    const cacheKey = this.generateChannelsCacheKey(guildId);
    await this.cacheManager.del(cacheKey);
  }

  async clearWebhooksCache(channelId: string): Promise<void> {
    const cacheKey = this.generateWebhooksCacheKey(channelId);
    await this.cacheManager.del(cacheKey);
  }
}
