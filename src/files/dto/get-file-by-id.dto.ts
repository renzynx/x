import { IsUUID } from 'class-validator';

export class GetFileByIdDto {
  @IsUUID()
  id: string;
}
