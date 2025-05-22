import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { CreateChunkDto } from './create-chunk.dto';

export class StoreFileChunksDto {
  @IsString()
  name: string;

  @IsInt()
  size: number;

  @IsString()
  type: string;

  @IsInt()
  total_chunks: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChunkDto)
  chunks: CreateChunkDto[];
}
