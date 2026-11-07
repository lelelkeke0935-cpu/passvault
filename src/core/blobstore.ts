import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Documents and photos are encrypted before they reach a blob store; the store only ever sees ciphertext.
export interface BlobStore {
  kind: 'wasabi' | 'local';
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
}

export function localStore(dir: string): BlobStore {
  const path = (key: string) => join(dir, key);
  return {
    kind: 'local',
    async put(key, data) {
      mkdirSync(dirname(path(key)), { recursive: true });
      writeFileSync(path(key), data);
    },
    async get(key) {
      return readFileSync(path(key));
    },
    async del(key) {
      rmSync(path(key), { force: true });
    },
  };
}

export function wasabiStore(env: NodeJS.ProcessEnv): BlobStore {
  const bucket = env.WASABI_BUCKET!;
  const s3 = new S3Client({
    endpoint: env.WASABI_ENDPOINT,
    region: env.WASABI_REGION,
    forcePathStyle: true,
    // Newer SDKs send extra checksum headers that S3-compatible services may reject.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.WASABI_ACCESS_KEY_ID!, secretAccessKey: env.WASABI_SECRET_ACCESS_KEY! },
  });
  return {
    kind: 'wasabi',
    async put(key, data) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: 'application/octet-stream' }));
    },
    async get(key) {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async del(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

const WASABI_VARS = ['WASABI_ENDPOINT', 'WASABI_REGION', 'WASABI_BUCKET', 'WASABI_ACCESS_KEY_ID', 'WASABI_SECRET_ACCESS_KEY'];

/** Wasabi when all five variables are set, otherwise DATA_DIR/blobs. */
export function blobStoreFromEnv(env: NodeJS.ProcessEnv, dataDir: string): BlobStore {
  return WASABI_VARS.every((v) => env[v]) ? wasabiStore(env) : localStore(join(dataDir, 'blobs'));
}
