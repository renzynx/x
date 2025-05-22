import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteWebhookDto {
  @IsString()
  @IsNotEmpty()
  webhook_id: string;
}
