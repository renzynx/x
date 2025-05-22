export class FileResponseDto {
  id: string;
  name: string;
  size: number;
  type: string;
  user_id: string;
  total_chunks: number;
  created_at: Date;
  updated_at: Date;
  chunks?: ChunkResponseDto[];
}

export class ChunkResponseDto {
  id: string;
  file_id: string;
  chunk_number: number;
  url: string;
  url_expiry: Date;
}

export class FileListResponseDto {
  files: FileResponseDto[];
  total: number;
}

export class RefreshUrlsResponseDto {
  refreshed_urls: Record<string, string>[];
}
