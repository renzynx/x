import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from 'src/auth/guards/discord.guard';
import { GuildsService } from 'src/guilds/guilds.service';
import {
  CreateWebhookDto,
  DeleteWebhookDto,
  GetWebhooksDto,
  WebhookResponseDto,
} from './dto';

@UseGuards(AuthenticatedGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly guildService: GuildsService) {}

  @Get(':channel_id')
  async getWebhooks(
    @Param('channel_id') channel_id: string,
  ): Promise<WebhookResponseDto[]> {
    const params: GetWebhooksDto = { channel_id };
    return this.guildService.getWebhooks(params.channel_id);
  }

  @Post()
  async createWebhook(
    @Body() createWebhookDto: CreateWebhookDto,
  ): Promise<WebhookResponseDto> {
    return this.guildService.createWebhook(createWebhookDto);
  }

  @Delete(':webhook_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(@Param('webhook_id') webhook_id: string): Promise<void> {
    const params: DeleteWebhookDto = { webhook_id };
    await this.guildService.deleteWebhook(params.webhook_id);
  }

  @Delete(':webhook_id/channel/:channel_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhookWithChannelId(
    @Param('webhook_id') webhook_id: string,
    @Param('channel_id') channel_id: string,
  ): Promise<void> {
    await this.guildService.deleteWebhook(webhook_id);
    // Clear the webhooks cache for this channel
    await this.guildService.clearWebhooksCache(channel_id);
  }
}
