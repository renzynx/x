import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { GuildsService } from 'src/guilds/guilds.service';
import { AuthService } from 'src/auth/auth.service';

@Module({
  controllers: [WebhooksController],
  providers: [GuildsService, AuthService],
})
export class WebhooksModule {}
