import { IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFileDto {
  @IsString()
  name: string;

  @IsInt()
  size: number;

  @IsString()
  type: string;

  @IsInt()
  total_chunks: number;

  @IsUUID()
  @IsOptional()
  user_id?: string;
}
