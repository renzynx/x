import { Module } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { GuildsController } from './guilds.controller';
import { AuthService } from 'src/auth/auth.service';

@Module({
  providers: [GuildsService, AuthService],
  controllers: [GuildsController],
  exports: [GuildsService],
})
export class GuildsModule {}
