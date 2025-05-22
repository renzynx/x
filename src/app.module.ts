import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { GuildsModule } from './guilds/guilds.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CacheModule } from '@nestjs/cache-manager';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    GuildsModule,
    WebhooksModule,
    CacheModule.register({
      isGlobal: true,
    }),
    FilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
