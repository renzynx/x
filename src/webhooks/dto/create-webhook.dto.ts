import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  channel_id: string;

  @IsString()
  @IsOptional()
  @Length(1, 80)
  name?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
