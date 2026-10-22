import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '../config/config.service.js';

export interface StorageObjectResult {
  body: Uint8Array;
  contentType?: string;
  contentLength?: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly defaultBucket: string;

  constructor(private readonly configService: ConfigService) {
    const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET } = this.configService.values;
    this.defaultBucket = S3_BUCKET;

    this.client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for S3-compatible backends like MinIO
    });
  }

  get s3Client(): S3Client {
    return this.client;
  }

  get bucket(): string {
    return this.defaultBucket;
  }

  /**
   * Ensures the storage bucket exists in S3 / MinIO.
   */
  async ensureBucketExists(bucketName?: string): Promise<void> {
    const bucket = bucketName ?? this.defaultBucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`Created bucket '${bucket}' in object storage.`);
      } catch (err) {
        this.logger.warn(`Could not create bucket '${bucket}': ${(err as Error).message}`);
      }
    }
  }

  /**
   * Verifies connectivity to the object storage service and checks bucket accessibility.
   */
  async verifyConnection(bucketName?: string): Promise<{ ok: boolean; latencyMs: number }> {
    const bucket = bucketName ?? this.defaultBucket;
    await this.ensureBucketExists(bucket);
    const start = Date.now();
    await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  }

  /**
   * Puts a binary object into S3 storage.
   */
  async putObject(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string,
    bucketName?: string
  ): Promise<{ key: string; bucket: string }> {
    const bucket = bucketName ?? this.defaultBucket;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: typeof body === 'string' ? Buffer.from(body) : body,
        ContentType: contentType ?? 'application/octet-stream',
      })
    );
    return { key, bucket };
  }

  /**
   * Retrieves a binary object from S3 storage.
   */
  async getObject(key: string, bucketName?: string): Promise<StorageObjectResult> {
    const bucket = bucketName ?? this.defaultBucket;
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    const byteArray = await response.Body?.transformToByteArray();
    return {
      body: byteArray ?? new Uint8Array(),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  /**
   * Deletes an object from S3 storage.
   */
  async deleteObject(key: string, bucketName?: string): Promise<{ key: string; bucket: string }> {
    const bucket = bucketName ?? this.defaultBucket;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return { key, bucket };
  }

  /**
   * Healthcheck helper for readiness endpoints.
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    try {
      const result = await this.verifyConnection();
      return { status: 'up', latencyMs: result.latencyMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Storage check failed';
      this.logger.error(`Storage health check failed: ${message}`);
      return { status: 'down', error: 'Object storage inaccessible' };
    }
  }
}
