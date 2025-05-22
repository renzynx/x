import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DiscordStrategy } from './strategies/discord.strategy';
import { SessionSerializer } from './strategies/session.serializer';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { GuildsService } from 'src/guilds/guilds.service';

@Module({
  imports: [PassportModule.register({ session: true })],
  providers: [AuthService, DiscordStrategy, SessionSerializer, GuildsService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
