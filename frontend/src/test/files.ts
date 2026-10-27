import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Reads a file from disk, by its path from frontend/ (e.g. "../classic/styles.css"). */
export function readAppFile(path: string): string {
  return readFileSync(resolve(appDir, path), 'utf8')
}
