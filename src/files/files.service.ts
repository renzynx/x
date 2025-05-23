import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, count, desc, eq } from 'drizzle-orm';
import { db, files, chunks, InsertFile, InsertChunk } from 'src/db';
import {
  CreateFileDto,
  StoreFileChunksDto,
  FileListResponseDto,
  FileResponseDto,
  GetFileByIdDto,
  GetFilesDto,
  RefreshUrlsDto,
  SortField,
  SortOrder,
  StreamFileDto,
} from './dto';
import { Response } from 'express';

@Injectable()
export class FilesService {
  private readonly DISCORD_BOT_TOKEN: string;

  constructor(private readonly configService: ConfigService) {
    this.DISCORD_BOT_TOKEN = configService.getOrThrow('DISCORD_BOT_TOKEN');
  }
  async getFiles({
    user_id,
    limit,
    offset,
    sortBy = SortField.CREATED_AT,
    orderBy = SortOrder.DESC,
  }: GetFilesDto): Promise<FileListResponseDto> {
    const orderFields = Object.values(SortField);
    const sort = orderFields.includes(sortBy) ? sortBy : SortField.CREATED_AT;
    const orderDirection =
      orderBy === SortOrder.ASC ? SortOrder.ASC : SortOrder.DESC;
    const orderByClause = orderDirection === SortOrder.ASC ? asc : desc;

    const [countResult] = await db
      .select({ value: count() })
      .from(files)
      .where(eq(files.user_id, user_id));

    const filesList = await db.query.files.findMany({
      where: eq(files.user_id, user_id),
      limit,
      offset,
      orderBy: (files) => orderByClause(files[sort]),
      with: {
        chunks: true,
      },
    });

    return {
      files: filesList,
      total: countResult.value,
    };
  }
  async getFileById({ id }: GetFileByIdDto): Promise<FileResponseDto | null> {
    const result = await db.query.files.findFirst({
      where: eq(files.id, id),
      with: {
        chunks: true,
      },
    });

    return result || null;
  }
  async createFile(fileDto: CreateFileDto): Promise<FileResponseDto> {
    const file: InsertFile = {
      name: fileDto.name,
      size: fileDto.size,
      type: fileDto.type,
      user_id: fileDto.user_id!,
      total_chunks: fileDto.total_chunks,
    };

    const [createdFile] = await db.insert(files).values(file).returning();

    return createdFile;
  }
  async refreshUrls({
    urls,
  }: RefreshUrlsDto): Promise<{ refreshed_urls: string[] }> {
    const regex =
      /https:\/\/(?:media|cdn)\.discord(app)?\.net\/attachments\/\d+\/\d+\/[^/\s]+\.(jpg|png|webp|gif)(\?[^ \n]*)?/;

    const filteredUrls = urls.filter((url) => regex.test(url));

    const uniqueUrls = Array.from(new Set(filteredUrls));

    const res = await fetch(
      'https://discord.com/api/v10/attachments/refresh-urls',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${this.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          attachment_urls: uniqueUrls,
        }),
      },
    );

    if (!res.ok) {
      throw new InternalServerErrorException(
        `Failed to refresh URLs: ${res.status} ${await res.text()}`,
      );
    }
    const data = await res.json();

    return { refreshed_urls: data.refreshed_urls };
  }
  async storeFileWithChunks({
    name,
    size,
    type,
    total_chunks,
    user_id,
    chunks: chunksData,
  }: StoreFileChunksDto & { user_id: string }): Promise<FileResponseDto> {
    // First create the file record
    const file: InsertFile = {
      name,
      size,
      type,
      user_id,
      total_chunks,
    };

    // Insert the file and get its ID
    const [createdFile] = await db.insert(files).values(file).returning();

    // Now insert all chunks for this file
    const chunksToInsert: InsertChunk[] = chunksData.map((chunk) => ({
      file_id: createdFile.id,
      chunk_number: chunk.chunk_number,
      url: chunk.url,
      url_expiry: new Date(chunk.url_expiry),
    }));

    // Insert all chunks
    if (chunksToInsert.length > 0) {
      await db.insert(chunks).values(chunksToInsert);
    }

    // Fetch the file with its chunks to return
    const fileWithChunks = await db.query.files.findFirst({
      where: eq(files.id, createdFile.id),
      with: {
        chunks: true,
      },
    });

    if (!fileWithChunks) {
      throw new InternalServerErrorException('Failed to retrieve created file');
    }

    return fileWithChunks;
  }
  async deleteFile(id: string, userId: string): Promise<{ success: boolean }> {
    try {
      // First verify that the file exists and belongs to the user
      const file = await db.query.files.findFirst({
        where: eq(files.id, id),
      });

      if (!file) {
        return { success: false };
      }

      // Check if the user owns this file
      if (file.user_id !== userId) {
        return { success: false };
      }

      // Delete the file - chunks will be deleted automatically due to cascade
      const result = await db.delete(files).where(eq(files.id, id));

      return { success: result.rowsAffected > 0 };
    } catch (error) {
      console.error('Error deleting file:', error);
      return { success: false };
    }
  }
  async streamFile(
    streamFileDto: StreamFileDto,
    userId: string,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = streamFileDto;

      // Verify that the file exists and belongs to the user
      const file = await db.query.files.findFirst({
        where: eq(files.id, id),
        with: {
          chunks: true,
        },
      });

      if (!file) {
        throw new NotFoundException(`File with id ${id} not found`);
      }

      // Check if the user owns this file
      if (file.user_id !== userId) {
        throw new ForbiddenException('You do not have access to this file');
      }

      // Check if the file has chunks
      if (!file.chunks || file.chunks.length === 0) {
        throw new NotFoundException(`No chunks found for file ${id}`);
      }

      // Sort chunks by chunk_number
      const sortedChunks = [...file.chunks].sort(
        (a, b) => a.chunk_number - b.chunk_number,
      );

      // Check if URLs need refreshing
      const now = new Date();
      const expiredChunks = sortedChunks.filter(
        (chunk) => new Date(chunk.url_expiry) <= now,
      );

      // If any URLs are expired, refresh them
      if (expiredChunks.length > 0) {
        const urlsToRefresh = expiredChunks.map((chunk) => chunk.url);
        const { refreshed_urls } = await this.refreshUrls({
          urls: urlsToRefresh,
        });

        // Update expired chunks with new URLs
        for (let i = 0; i < expiredChunks.length; i++) {
          if (refreshed_urls[i]) {
            // Update the chunk URL in memory
            const chunkIndex = sortedChunks.findIndex(
              (c) => c.id === expiredChunks[i].id,
            );
            if (chunkIndex !== -1) {
              sortedChunks[chunkIndex].url = refreshed_urls[i];
            }

            // Update the chunk URL in database
            await db
              .update(chunks)
              .set({
                url: refreshed_urls[i],
                url_expiry: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
              })
              .where(eq(chunks.id, expiredChunks[i].id));
          }
        }
      }

      // Create a safe filename
      const safeFilename = file.name.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      const totalFileSize = file.size;

      // Determine if it's a media file that typically benefits from streaming
      const isStreamableMedia =
        file.type &&
        (file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/') ||
          file.type === 'application/pdf');

      // Set response headers
      res.status(200);
      res.setHeader('Content-Type', file.type || 'application/octet-stream');

      // For streamable media without download intention, use inline disposition
      // Use the download parameter from DTO if provided, otherwise check query param for backward compatibility
      const shouldDownload =
        streamFileDto.download !== undefined
          ? streamFileDto.download
          : !!res.req.query.download;

      if (isStreamableMedia && !shouldDownload) {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${safeFilename}"`,
        );
      } else {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeFilename}"`,
        );
      }

      // Set content length
      res.setHeader('Content-Length', totalFileSize.toString());
      // Add caching and other headers
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-File-Name', safeFilename);
      res.setHeader('X-File-Size', totalFileSize.toString());
      res.setHeader('X-Chunk-Count', sortedChunks.length.toString());

      // Add cross-origin isolation headers for better compatibility with modern browsers
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      console.log(`[FileStream] Starting stream for file "${safeFilename}"`);

      // Stream each chunk sequentially
      for (let i = 0; i < sortedChunks.length; i++) {
        const chunk = sortedChunks[i];
        console.log(
          `[FileStream] Processing chunk ${i + 1}/${sortedChunks.length}`,
        );

        try {
          // Download the chunk
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn(`[FileStream] Download timeout for chunk ${i}`);
            abortController.abort();
          }, 30000); // 30 second timeout

          const response = await fetch(chunk.url, {
            headers: {
              'User-Agent': 'DiscordBot (fullx-app, 1.0.0)',
              Referer: 'https://discord.com/',
            },
            signal: abortController.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Failed to fetch chunk ${chunk.chunk_number}: ${response.status} ${response.statusText}`,
            );
          }

          // Get the response as an array buffer and convert to Node.js Buffer
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (buffer.byteLength === 0) {
            throw new Error(
              `Received empty chunk data for chunk ${chunk.chunk_number}`,
            );
          }

          console.log(
            `[FileStream] Downloaded chunk ${i + 1}/${sortedChunks.length}, size: ${(buffer.byteLength / 1024).toFixed(2)} KB`,
          );

          // Write the buffer directly to the response
          const writeSuccess = res.write(buffer);

          // If the client is slow, wait for drain event before continuing
          if (!writeSuccess) {
            await new Promise<void>((resolve) => {
              res.once('drain', () => resolve());
            });
          }

          console.log(
            `[FileStream] Streamed chunk ${i + 1}/${sortedChunks.length} to client`,
          );
        } catch (error) {
          console.error(
            `[FileStream] Error processing chunk ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );

          if (!res.headersSent) {
            res.status(500).json({
              message: 'Error streaming file',
              error: error instanceof Error ? error.message : 'Unknown error',
              code: 'CHUNK_DOWNLOAD_FAILED',
            });
          } else {
            res.end();
          }

          return;
        }
      }

      // Complete the response
      res.end();
      console.log(`[FileStream] File "${safeFilename}" successfully streamed`);
    } catch (error) {
      console.error('[FileStream] Error in streamFile:', error);
      if (!res.headersSent) {
        res.status(500).json({
          message: 'Error streaming file',
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'STREAM_FAILED',
        });
      } else {
        // Best effort to end the response if we've already started streaming
        try {
          res.end();
        } catch (endError) {
          console.error(
            '[FileStream] Error ending response after failure:',
            endError,
          );
        }
      }
    }
  }
}
