import { IsArray, IsUrl } from 'class-validator';

export class RefreshUrlsDto {
  @IsArray()
  @IsUrl({}, { each: true })
  urls: string[];
}
