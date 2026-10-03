// Adaptação Lambda: trocar readFileSync/renameSync por S3 GetObject/PutObject.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

const FILE = 'state.json';

export function readState() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(state) {
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, FILE);
}
