import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Reads a file from disk, by its path from web/ (e.g. "../frontend/styles.css"). */
export function readWebFile(path: string): string {
  return readFileSync(resolve(webDir, path), 'utf8')
}
