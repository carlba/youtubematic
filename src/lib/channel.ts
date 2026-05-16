import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path, { join } from 'node:path';
import fs from 'node:fs/promises';
import type { Config } from './config.js';
import { attachAbortSignalToChild } from './utils.js';

export interface DownloadResult {
  code: number;
  downloadedFiles: string[];
}

export async function listFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await listFiles(fullPath);
        for (const nestedPath of nested) {
          results.push(path.join(entry.name, nestedPath));
        }
      } else if (entry.isFile()) {
        results.push(entry.name);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return results;
}

export function buildYtDlpArgs(channel: string, config: Config): string[] {
  const outputTemplate = join(config.downloadPath, '%(uploader)s', '%(title)s.%(ext)s');

  const args: string[] = [
    '--output',
    outputTemplate,
    '--js-runtimes',
    'node',
    '--format',
    'bestvideo[ext=mp4][vcodec*=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
    '--merge-output-format',
    'mp4',
    '--embed-chapters',
    '--add-metadata',
    '--no-overwrites',
    '--no-progress',
  ];

  if (config.maxEpisodes !== null) {
    args.push('--playlist-end', config.maxEpisodes.toString());
  }

  if (config.maxAgeDays !== null) {
    args.push('--dateafter', `today-${config.maxAgeDays}day`);
  }

  if (config.matchFilter !== null) {
    args.push('--match-filter', config.matchFilter);
  }

  args.push(channel);

  return args;
}

export async function downloadChannel(
  channel: string,
  config: Config,
  signal?: AbortSignal
): Promise<DownloadResult> {
  const args = buildYtDlpArgs(channel, config);

  console.log(`Downloading from: ${channel}`);
  const beforeFiles = new Set(await listFiles(config.downloadPath));

  const child = spawn(config.ytDlpPath, args, { stdio: 'inherit', detached: true, signal });

  if (signal) {
    attachAbortSignalToChild(child, signal);
  }

  try {
    const closePromise = once(child, 'close');
    const errorPromise = once(child, 'error').then(([error]) => {
      throw error;
    });

    const [code] = (await Promise.race([closePromise, errorPromise])) as [number, NodeJS.Signals];

    if (code !== 0) {
      throw new Error(`yt-dlp exited with code ${String(code)}`);
    }

    const afterFiles = await listFiles(config.downloadPath);
    const downloadedFiles = afterFiles.filter(file => !beforeFiles.has(file));

    return { code, downloadedFiles };
  } finally {
    child.removeAllListeners();
  }
}
