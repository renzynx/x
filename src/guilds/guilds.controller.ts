import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { AuthenticatedGuard } from 'src/auth/guards/discord.guard';

@Controller('guilds')
export class GuildsController {
  constructor(private readonly guildService: GuildsService) {}

  @UseGuards(AuthenticatedGuard)
  @Get()
  async getGuilds(@Req() req, @Param('sync') sync?: string) {
    return this.guildService.getGuilds(req.user, sync ? sync === '1' : false);
  }

  @UseGuards(AuthenticatedGuard)
  @Get(':guild_id')
  async getGuildChannels(@Param('guild_id') guild_id: string) {
    return this.guildService.getGuildChannels(guild_id);
  }
}
