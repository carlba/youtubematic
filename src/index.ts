import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Cron } from 'croner';

export interface Config {
  downloadPath: string;
  channels: string[];
  maxEpisodes: number | null;
  maxAgeDays: number | null;
  ytDlpPath: string;
  cronPattern: string | null;
  matchFilter: string | null;
}

function parseOptionalInt(value: string | undefined): number | null {
  return value !== undefined && value !== '' ? parseInt(value, 10) : null;
}

function parseOptionalString(value: string | undefined): string | null {
  return value !== undefined && value !== '' ? value : null;
}

export function getConfig(): Config {
  const downloadPath = process.env['DOWNLOAD_PATH'] ?? '/mnt/downloads';
  const channels = (process.env['CHANNELS'] ?? '')
    .split(/[\n,]/)
    .map(c => c.trim())
    .filter(c => c.length > 0);
  const maxEpisodes = parseOptionalInt(process.env['MAX_EPISODES']);
  const maxAgeDays = parseOptionalInt(process.env['MAX_AGE_DAYS']);
  const ytDlpPath = process.env['YT_DLP_PATH'] ?? 'yt-dlp';
  const cronPattern = parseOptionalString(process.env['CRON_PATTERN']);
  const matchFilter = parseOptionalString(process.env['MATCH_FILTER']);

  const config = {
    downloadPath,
    channels,
    maxEpisodes,
    maxAgeDays,
    ytDlpPath,
    cronPattern,
    matchFilter,
  };

  console.log('CONFIG', config);

  return config;
}

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

export async function downloadChannel(channel: string, config: Config): Promise<void> {
  const args = buildYtDlpArgs(channel, config);

  console.log(`Downloading from: ${channel}`);
  const child = spawn(config.ytDlpPath, args, { stdio: 'inherit' });
  currentChild = child;

  try {
    const [code] = await once(child, 'close');

    if (code !== 0) {
      throw new Error(`yt-dlp exited with code ${String(code)}`);
    }
  } finally {
    currentChild = null;
  }
}

export async function runOnce(config: Config): Promise<void> {
  mkdirSync(config.downloadPath, { recursive: true });

  for (const channel of config.channels) {
    try {
      await downloadChannel(channel, config);
    } catch (error) {
      console.error(`Failed to download from ${channel}:`, error);
    }
  }
}

async function main(): Promise<void> {
  const config = getConfig();

  if (config.channels.length === 0) {
    console.error('No channels configured. Set the CHANNELS environment variable.');
    process.exit(1);
  }

  if (config.cronPattern) {
    console.log(`Scheduling downloads using CRON pattern: ${config.cronPattern}`);

    new Cron(config.cronPattern, async () => {
      console.log('Running scheduled download cycle');
      try {
        await runOnce(config);
      } catch (error) {
        console.error('Scheduled download cycle failed:', error);
      }
    });

    await runOnce(config);
    console.log('Scheduler initialized, running continuously.');
  } else {
    await runOnce(config);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  setupSignalForwarding();
  main().catch(console.error);
}
