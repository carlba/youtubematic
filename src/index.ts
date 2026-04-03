import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Config {
  downloadPath: string;
  channels: string[];
  maxEpisodes: number | null;
  maxAgeDays: number | null;
  ytDlpPath: string;
}

function formatDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);

  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

export function getConfig(): Config {
  const downloadPath = process.env['DOWNLOAD_PATH'] ?? '/mnt/downloads';
  const channelsEnv = process.env['CHANNELS'] ?? '';
  const channels = channelsEnv
    .split(/[\n,]/)
    .map(c => c.trim())
    .filter(c => c.length > 0);
  const maxEpisodesEnv = process.env['MAX_EPISODES'];
  const maxEpisodes =
    maxEpisodesEnv !== undefined && maxEpisodesEnv !== '' ? parseInt(maxEpisodesEnv, 10) : null;
  const maxAgeDaysEnv = process.env['MAX_AGE_DAYS'];
  const maxAgeDays =
    maxAgeDaysEnv !== undefined && maxAgeDaysEnv !== '' ? parseInt(maxAgeDaysEnv, 10) : null;
  const ytDlpPath = process.env['YT_DLP_PATH'] ?? 'yt-dlp';

  const config = { downloadPath, channels, maxEpisodes, maxAgeDays, ytDlpPath };

  console.log('CONFIG', config);

  return config;
}

export function buildYtDlpArgs(channel: string, config: Config): string[] {
  const outputTemplate = join(config.downloadPath, '%(uploader)s', '%(title)s.%(ext)s');

  const args: string[] = [
    '--output',
    outputTemplate,
    '--js-runtimes',
    'node',
    '--format',
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
  ];

  if (config.maxEpisodes !== null) {
    args.push('--playlist-end', config.maxEpisodes.toString());
  }

  if (config.maxAgeDays !== null) {
    args.push('--dateafter', formatDateDaysAgo(config.maxAgeDays));
  }

  args.push(channel);

  return args;
}

export function downloadChannel(channel: string, config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = buildYtDlpArgs(channel, config);

    console.log(`Downloading from: ${channel}`);
    const child = spawn(config.ytDlpPath, args, { stdio: 'inherit' });

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp exited with code ${String(code)}`));
      }
    });

    child.on('error', err => {
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  const config = getConfig();

  if (config.channels.length === 0) {
    console.error('No channels configured. Set the CHANNELS environment variable.');
    process.exit(1);
  }

  mkdirSync(config.downloadPath, { recursive: true });

  for (const channel of config.channels) {
    try {
      await downloadChannel(channel, config);
    } catch (error) {
      console.error(`Failed to download from ${channel}:`, error);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(console.error);
}
