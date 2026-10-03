import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';

const BUCKET     = process.env.STATE_BUCKET;
const LOCAL_FILE = 'state.json';
const S3_KEY     = 'state.json';

// S3Client criado só quando BUCKET está definido (evita import desnecessário no teste local)
let _s3 = null;
async function s3() {
  if (!_s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3 = new S3Client({});
  }
  return _s3;
}

export async function readState() {
  if (BUCKET) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const res = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: S3_KEY }));
      return JSON.parse(await res.Body.transformToString());
    } catch (err) {
      if (err.name === 'NoSuchKey') return {};
      throw err;
    }
  }
  if (!existsSync(LOCAL_FILE)) return {};
  try { return JSON.parse(readFileSync(LOCAL_FILE, 'utf8')); }
  catch { return {}; }
}

export async function writeState(state) {
  if (BUCKET) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: S3_KEY,
      Body: JSON.stringify(state, null, 2),
      ContentType: 'application/json',
    }));
    return;
  }
  const tmp = LOCAL_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, LOCAL_FILE);
}
