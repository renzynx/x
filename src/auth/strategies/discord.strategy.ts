import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { Profile, Scope, Strategy } from 'passport-discord-auth';
import { db, users } from 'src/db';
import { GuildsService } from 'src/guilds/guilds.service';
import { guildsWithAdmin } from 'src/lib/utils';
import { Done } from 'src/types';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly guildService: GuildsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super({
      clientId: configService.getOrThrow('DISCORD_CLIENT_ID'),
      clientSecret: configService.getOrThrow('DISCORD_CLIENT_SECRET'),
      callbackUrl: configService.getOrThrow('DISCORD_CALLBACK_URL'),
      scope: [Scope.Identify, Scope.Email, Scope.Guilds],
    });
  }

  async validate(
    access_token: string,
    refresh_token: string,
    profile: Profile,
    done: Done,
  ) {
    const { id: discord_id, username, avatar, email, guilds } = profile;

    try {
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.discord_id, discord_id));

      if (!user) {
        [user] = await db
          .insert(users)
          .values({
            avatar: `https://cdn.discordapp.com/avatars/${discord_id}/${avatar}`,
            discord_id,
            username,
            email: email!,
            access_token,
            refresh_token,
            token_expiry: new Date(Date.now() + 604800000),
          })
          .returning();
      }

      if (guilds) {
        const cacheKey = this.guildService.generateGuildsCacheKey(user.id);

        const filteredGuilds = guildsWithAdmin(guilds);

        await this.cacheManager.set(cacheKey, JSON.stringify(filteredGuilds));
      }

      return done(null, user);
    } catch (error) {
      console.error('Error in DiscordStrategy validate:', error);
      return done(error, null);
    }
  }
}
