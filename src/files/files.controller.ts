import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from 'src/auth/guards/discord.guard';
import { FilesService } from './files.service';
import {
  CreateFileDto,
  GetFileByIdDto,
  GetFilesDto,
  RefreshUrlsDto,
  SortField,
  SortOrder,
  StoreFileChunksDto,
  StreamFileDto,
} from './dto';
import { User } from 'src/db';
import { CurrentUser } from 'src/lib/utils';
import { Response } from 'express';

@Controller('files')
@UseGuards(AuthenticatedGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async getFiles(
    @CurrentUser() user: User,
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
    @Query('sortBy') sortBy = 'created_at',
    @Query('orderBy') orderBy = 'desc',
  ) {
    const dto: GetFilesDto = {
      user_id: user.id,
      limit: Number(limit),
      offset: Number(offset),
      sortBy: sortBy as SortField,
      orderBy: orderBy as SortOrder,
    };

    return this.filesService.getFiles(dto);
  }

  @Get(':id')
  async getFileById(@Param('id') id: string) {
    const dto: GetFileByIdDto = { id };
    return this.filesService.getFileById(dto);
  }

  @Post()
  async createFile(
    @CurrentUser() user: User,
    @Body() createFileDto: CreateFileDto,
  ) {
    createFileDto.user_id = user.id;
    return this.filesService.createFile(createFileDto);
  }
  @Post('refresh-urls')
  async refreshUrls(@Body() refreshUrlsDto: RefreshUrlsDto) {
    return this.filesService.refreshUrls(refreshUrlsDto);
  }

  @Post('store')
  async storeFileWithChunks(
    @CurrentUser() user: User,
    @Body() storeFileChunksDto: StoreFileChunksDto,
  ) {
    return this.filesService.storeFileWithChunks({
      ...storeFileChunksDto,
      user_id: user.id,
    });
  }
  @Delete(':id')
  async deleteFile(@CurrentUser() user: User, @Param('id') id: string) {
    return this.filesService.deleteFile(id, user.id);
  }
  @Get(':id/stream')
  async streamFile(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const dto: StreamFileDto = {
      id,
      download: download === 'true' || download === '1',
    };
    return this.filesService.streamFile(dto, user.id, res);
  }
}
