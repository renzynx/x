import { IsNotEmpty, IsString } from 'class-validator';

export class GetWebhooksDto {
  @IsString()
  @IsNotEmpty()
  channel_id: string;
}
