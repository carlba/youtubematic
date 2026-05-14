import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Cron } from 'croner';
import { refreshPlex } from './plex.js';
import fs from 'node:fs/promises';
import { getConfig, type Config } from './lib/config.js';
import { envSchema } from './schema.js';

let currentChild: ChildProcess | null = null;

function forwardSignal(signal: NodeJS.Signals): void {
  if (currentChild && !currentChild.killed) {
    console.log(`Forwarding ${signal} to child process ${currentChild.pid}`);
    currentChild.kill(signal);
  }
}

function setupSignalForwarding(): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

  for (const signal of signals) {
    process.on(signal, () => {
      forwardSignal(signal);
      process.exit(0);
    });
  }
}

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

export async function downloadChannel(channel: string, config: Config): Promise<DownloadResult> {
  const args = buildYtDlpArgs(channel, config);

  console.log(`Downloading from: ${channel}`);
  const beforeFiles = new Set(await listFiles(config.downloadPath));
  const child = spawn(config.ytDlpPath, args, { stdio: 'inherit' });
  currentChild = child;

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

    return {
      code,
      downloadedFiles,
    };
  } finally {
    currentChild = null;
  }
}

export async function runOnce(config: Config): Promise<void> {
  mkdirSync(config.downloadPath, { recursive: true });
  let hasNewFiles = false;

  for (const channel of config.channels) {
    try {
      const { downloadedFiles } = await downloadChannel(channel, config);
      if (downloadedFiles.length > 0) {
        console.log(`Downloaded ${downloadedFiles.length} new file(s) for ${channel}`);
        hasNewFiles = true;
      } else {
        console.log(`No new downloads for ${channel}`);
      }
    } catch (error) {
      console.error(`Failed to download from ${channel}:`, error);
    }
  }

  if (hasNewFiles) {
    try {
      await refreshPlex(
        config.downloadPath,
        config,
        `Plex refresh triggered by completed yt-dlp download run (path: ${config.downloadPath || 'n/a'})`
      );
    } catch (error) {
      console.error('Plex refresh failed:', error);
    }
  }
}

async function run(config: Config): Promise<void> {
  if (config.channels.length === 0) {
    console.error('No channels configured. Set the CHANNELS environment variable.');
    process.exit(1);
  }

  if (config.cronPattern) {
    console.log(`Scheduling downloads using CRON pattern: ${config.cronPattern}`);
    new Cron(config.cronPattern, () => {
      console.log('Running scheduled download cycle');
      void runOnce(config).catch(error => {
        console.error('Scheduled download cycle failed:', error);
      });
    });
    await runOnce(config);
    console.log('Scheduler initialized, running continuously.');
    return;
  }

  console.log('Download running once due to no CRON pattern configured');
  await runOnce(config);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  setupSignalForwarding();
  run(getConfig(envSchema)).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
