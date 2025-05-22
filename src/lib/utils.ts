import { Channel } from 'src/types';
import { GOOFY_AHH_NAMES } from './constants';
import { randomInt } from 'crypto';
import { ProfileGuild } from 'passport-discord-auth';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const guildsWithAdmin = (guilds: ProfileGuild[]) =>
  guilds.filter((guild) => {
    const permissionValue = Number(guild.permissions);
    return (permissionValue & 0x8) === 0x8;
  });

export const textChannels = (channels: Channel[]) =>
  channels.filter((channel) => channel.type === 0);

export const generateGoofyAhhName = () => {
  const randomIndex = randomInt(0, GOOFY_AHH_NAMES.length);
  return GOOFY_AHH_NAMES[randomIndex];
};

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
