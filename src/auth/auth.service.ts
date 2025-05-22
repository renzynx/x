import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscordTokenResponse } from 'src/types';

@Injectable()
export class AuthService {
  private DISCORD_CLIENT_ID: string;
  private DISCORD_CLIENT_SECRET: string;

  constructor(private readonly configService: ConfigService) {
    this.DISCORD_CLIENT_ID = configService.getOrThrow('DISCORD_CLIENT_ID');
    this.DISCORD_CLIENT_SECRET = configService.getOrThrow(
      'DISCORD_CLIENT_SECRET',
    );
  }

  async refreshToken(refreshToken: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          btoa(`${this.DISCORD_CLIENT_ID}:${this.DISCORD_CLIENT_SECRET}`),
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to refresh token: ${response.status} ${await response.text()}`,
      );
    }

    return response.json();
  }
}
