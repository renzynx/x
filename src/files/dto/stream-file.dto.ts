import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class StreamFileDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsBoolean()
  download?: boolean;
}
