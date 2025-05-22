import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard, DiscordAuthGuard } from './guards/discord.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  private readonly CORS_ORIGIN: string;

  constructor(private readonly configService: ConfigService) {
    this.CORS_ORIGIN = configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:4321',
    );
  }

  @UseGuards(DiscordAuthGuard)
  @Get('login')
  login() {
    return 'Redirecting to Discord login...';
  }

  @UseGuards(DiscordAuthGuard)
  @Get('callback')
  callback(@Res() res: Response) {
    return res.redirect(this.CORS_ORIGIN);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('@me')
  getMe(@Req() req) {
    const { access_token: _, refresh_token: __, ...rest } = req.user;

    return rest;
  }

  @HttpCode(200)
  @UseGuards(AuthenticatedGuard)
  @Post('logout')
  logout(@Req() req) {
    return req.logout(() => {});
  }
}
