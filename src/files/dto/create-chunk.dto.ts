import { IsInt, IsString, IsUrl } from 'class-validator';

export class CreateChunkDto {
  @IsInt()
  chunk_number: number;

  @IsString()
  @IsUrl()
  url: string;

  @IsInt()
  url_expiry: number; // Timestamp for URL expiration
}
