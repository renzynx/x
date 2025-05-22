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
      } // Create a safe filename
      const safeFilename = file.name.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      const totalFileSize = file.size;
      const contentLength = totalFileSize;
      const statusCode = 200;
      // Determine if it's a media file that typically benefits from streaming
      const isStreamableMedia =
        file.type &&
        (file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/') ||
          file.type === 'application/pdf');

      // Set response status and headers based on request type
      res.status(statusCode);
      // Set comprehensive response headers
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
      res.setHeader('Content-Length', contentLength.toString());
      // Add caching and other headers
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-File-Name', safeFilename);
      res.setHeader('X-File-Size', totalFileSize.toString());
      res.setHeader('X-Chunk-Count', sortedChunks.length.toString());

      // Always include Accept-Ranges header, even for non-range requests
      res.setHeader('Accept-Ranges', 'bytes');

      // Add cross-origin isolation headers for better compatibility with modern browsers
      // and to enable certain browser features like SharedArrayBuffer for video processing
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      // Initialize tracking variables
      // Enhanced variables for tracking stream state
      let currentChunkIndex = 0;
      let streamingComplete = false;
      const chunkBuffers: Map<number, Buffer> = new Map();
      const downloadingChunks: Set<number> = new Set();
      const failedRetries: Map<number, number> = new Map(); // Track retry attempts per chunk
      const MAX_RETRIES = 3; // Maximum retry attempts per chunk
      let hasError = false;
      const LOOK_AHEAD = 2; // Always download 2 chunks ahead

      // For each chunk, determine its size (use the content length if available, or estimate)
      const chunkSizes = sortedChunks.map((chunk) => {
        // Use a default/estimated size if the chunk doesn't have a size property
        return chunk['size'] || 9 * 1024 * 1024; // Default to 9MB chunk size
      });
      const chunkOffsets: number[] = [];

      // Calculate chunk offsets (start byte position of each chunk)
      let runningOffset = 0;
      for (const size of chunkSizes) {
        chunkOffsets.push(runningOffset);
        runningOffset += size;
      }
      // Create an improved function to download a specific chunk
      const downloadChunk = async (chunkIndex: number): Promise<void> => {
        // Skip if chunk is already processed or an error occurred
        if (
          chunkBuffers.has(chunkIndex) ||
          downloadingChunks.has(chunkIndex) ||
          hasError
        ) {
          return;
        }

        // Check retry count for this chunk
        const retryCount = failedRetries.get(chunkIndex) || 0;
        if (retryCount >= MAX_RETRIES) {
          console.error(
            `[FileStream] Chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts`,
          );
          hasError = true;

          if (!streamingComplete) {
            if (!res.headersSent) {
              res.status(500).json({
                message: 'Error streaming file',
                error: `Failed to download chunk ${chunkIndex} after ${MAX_RETRIES} attempts`,
                code: 'MAX_RETRIES_EXCEEDED',
              });
            } else {
              res.end();
            }
            streamingComplete = true;
          }
          return;
        }

        // Mark this chunk as being downloaded
        downloadingChunks.add(chunkIndex);

        const chunk = sortedChunks[chunkIndex];
        if (!chunk) {
          downloadingChunks.delete(chunkIndex);
          return;
        }

        const attemptMessage =
          retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRIES})` : '';
        console.log(
          `[FileStream] Downloading chunk ${chunkIndex + 1}/${sortedChunks.length}${attemptMessage}`,
        );

        try {
          // Set up timeout to prevent hanging downloads
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn(
              `[FileStream] Download timeout for chunk ${chunkIndex}`,
            );
            abortController.abort();
          }, 30000); // 30 second timeout

          // Fetch the chunk with proper headers
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

          // Convert to buffer
          const arrayBuffer = await response.arrayBuffer();

          if (arrayBuffer.byteLength === 0) {
            throw new Error(
              `Received empty chunk data for chunk ${chunk.chunk_number}`,
            );
          }

          console.log(
            `[FileStream] Downloaded chunk ${chunkIndex + 1}/${sortedChunks.length}, size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`,
          );

          // Store the downloaded chunk
          chunkBuffers.set(chunkIndex, Buffer.from(arrayBuffer));

          // Remove from downloading set and clear retry count on success
          downloadingChunks.delete(chunkIndex);
          failedRetries.delete(chunkIndex);

          // Process the next chunks if possible
          processNextChunks();
        } catch (error) {
          console.error(
            `[FileStream] Error downloading chunk ${chunk.chunk_number}:`,
            error,
          );
          downloadingChunks.delete(chunkIndex);

          // Increment retry count
          failedRetries.set(chunkIndex, retryCount + 1);

          // Attempt retry with exponential backoff if we haven't exceeded max retries
          if (retryCount < MAX_RETRIES && !streamingComplete) {
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff with 10s max
            console.log(
              `[FileStream] Retrying chunk ${chunkIndex} in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
            );
            setTimeout(() => {
              if (!streamingComplete) {
                void downloadChunk(chunkIndex);
              }
            }, backoffMs);
            return;
          }

          // Mark as error if exceeded retries
          hasError = true;

          // Handle error appropriately based on stream state
          if (streamingComplete) {
            return;
          }

          // Send error response if headers not sent yet
          if (!res.headersSent) {
            res.status(500).json({
              message: 'Error streaming file',
              error: error instanceof Error ? error.message : 'Unknown error',
              code: 'CHUNK_DOWNLOAD_FAILED',
            });
            streamingComplete = true;
          } else {
            // End the response if we've already started streaming
            res.end();
            streamingComplete = true;
          }
        }
      };
      // Main function that handles both streaming and scheduling downloads
      const processNextChunks = (): void => {
        if (streamingComplete || hasError) {
          return;
        }

        // 1. Stream available chunks to client
        let chunksStreamed = false;
        while (chunkBuffers.has(currentChunkIndex)) {
          const buffer = chunkBuffers.get(currentChunkIndex);

          if (buffer) {
            try {
              // Stream the entire chunk
              res.write(buffer);
              chunksStreamed = true;
              console.log(
                `[FileStream] Streamed chunk ${currentChunkIndex + 1}/${sortedChunks.length} to client`,
              );
            } catch (error) {
              console.error(
                `[FileStream] Error streaming chunk ${currentChunkIndex}:`,
                error,
              );
              streamingComplete = true;
              res.end();
              return;
            }
          }

          // Free memory as soon as chunk is streamed
          chunkBuffers.delete(currentChunkIndex);

          // Move to next chunk
          currentChunkIndex++;

          // Check if we've streamed all chunks
          if (currentChunkIndex >= sortedChunks.length) {
            console.log('[FileStream] All chunks streamed, ending response');
            res.end();
            streamingComplete = true;
            return;
          }
        }

        // 2. Schedule downloads for look-ahead chunks
        if (!streamingComplete) {
          scheduleDownloads();
        }

        // 3. Log progress if chunks were streamed
        if (chunksStreamed) {
          const downloadedCount = currentChunkIndex;
          const totalChunks = sortedChunks.length;
          const percentComplete = Math.round(
            (downloadedCount / totalChunks) * 100,
          );
          console.log(
            `[FileStream] Progress: ${percentComplete}% (${downloadedCount}/${totalChunks} chunks)`,
          );
        }
      };
      // Schedule downloads for the upcoming chunks
      const scheduleDownloads = (): void => {
        if (streamingComplete || hasError) {
          return;
        }

        // Calculate which chunks to download next
        const endIndex = Math.min(
          currentChunkIndex + LOOK_AHEAD,
          sortedChunks.length,
        );

        // Download chunks in the look-ahead window that aren't already being processed
        for (let i = currentChunkIndex; i < endIndex; i++) {
          if (!chunkBuffers.has(i) && !downloadingChunks.has(i)) {
            // Use void to explicitly ignore the promise
            void downloadChunk(i);
          }
        }
      };
      // Initialize stream: download the first few chunks
      const initialChunksToLoad = Math.min(LOOK_AHEAD + 1, sortedChunks.length);
      console.log(
        `[FileStream] Starting stream for file "${safeFilename}" (${sortedChunks.length} chunks)`,
      );

      // Download initial chunks in parallel
      const initialDownloads: Promise<void>[] = [];

      for (let i = 0; i < initialChunksToLoad; i++) {
        initialDownloads.push(downloadChunk(i));
      }

      // Wait for at least the first chunk to download before starting the stream
      await Promise.all(initialDownloads);

      // Start the streaming process
      processNextChunks();
      // Set up an interval to monitor stream health
      const healthCheckInterval = setInterval(() => {
        if (streamingComplete) {
          clearInterval(healthCheckInterval);
          return;
        }

        if (hasError) {
          streamingComplete = true;
          if (!res.headersSent) {
            res.status(500).json({
              message: 'Error streaming file',
              code: 'STREAM_ERROR',
            });
          } else {
            res.end();
          }
          clearInterval(healthCheckInterval);
          return;
        }

        // Check for stalled downloads - if currentChunkIndex hasn't moved but we're not done
        if (
          !chunkBuffers.has(currentChunkIndex) &&
          !downloadingChunks.has(currentChunkIndex) &&
          currentChunkIndex < sortedChunks.length
        ) {
          const retryCount = failedRetries.get(currentChunkIndex) || 0;
          if (retryCount < MAX_RETRIES) {
            console.log(
              `[FileStream] Health check detected stalled chunk ${currentChunkIndex}, restarting download`,
            );
            void downloadChunk(currentChunkIndex);
          } else {
            console.error(
              `[FileStream] Health check detected permanently failed chunk ${currentChunkIndex}`,
            );

            // Check if we can skip this chunk in emergency cases
            // Only do this if we've already streamed a significant portion of the file
            if (currentChunkIndex > sortedChunks.length * 0.8) {
              console.warn(
                `[FileStream] Attempting to skip problematic chunk ${currentChunkIndex} as we're near the end`,
              );
              currentChunkIndex++;
              processNextChunks();
            } else {
              hasError = true;
            }
          }
        }
        // Also check for overall stream progress
        const downloadedCount = currentChunkIndex;
        const pendingCount = downloadingChunks.size;
        const totalChunks = sortedChunks.length;
        const percentComplete = Math.round(
          (downloadedCount / totalChunks) * 100,
        );

        console.log(
          `[FileStream] Health check: ${percentComplete}% complete, ${downloadedCount}/${totalChunks} chunks streamed, ${pendingCount} pending downloads`,
        );
      }, 5000); // Check every 5 seconds
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
