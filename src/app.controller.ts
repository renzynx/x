import { Controller, Get, Query, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { INVITE_URL } from './lib/constants';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('bot/invite')
  invite(@Query('guild_id') guild_id: string, @Res() res: Response) {
    if (guild_id) {
      const url = new URL(INVITE_URL);

      url.searchParams.append('guild_id', guild_id);

      return res.redirect(url.toString());
    }

    return res.redirect(INVITE_URL);
  }
}
