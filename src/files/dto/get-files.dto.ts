import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum SortField {
  NAME = 'name',
  SIZE = 'size',
  CREATED_AT = 'created_at',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetFilesDto {
  @IsUUID()
  user_id: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 10;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset: number = 0;

  @IsEnum(SortField)
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  sortBy?: SortField = SortField.CREATED_AT;

  @IsEnum(SortOrder)
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  orderBy?: SortOrder = SortOrder.DESC;
}
