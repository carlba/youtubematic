import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import fs from 'node:fs/promises';

import { getConfig } from './lib/config.js';
import { envSchema } from './schema.js';
import { buildYtDlpArgs, downloadChannel } from './index.js';
import type { Config } from './lib/config.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

const TEST_CHANNEL = 'https://www.youtube.com/@testchannel';

const baseConfig: Config = {
  downloadPath: '/mnt/downloads',
  channels: [],
  maxEpisodes: null,
  maxAgeDays: null,
  ytDlpPath: 'yt-dlp',
  cronPattern: null,
  matchFilter: 'original_url!*=/shorts/ & url!*=/shorts/',
  plexUrl: 'http://plex:32400',
  plexToken: null,
  plexSectionId: null,
  plexBasePath: '/streaming/youtube',
  pushoverUrl: 'https://api.pushover.net/1/messages.json',
  pushoverToken: null,
  pushoverUser: null,
};

let tempDownloadPath = '';

async function makeTempDownloadConfig(): Promise<Config> {
  tempDownloadPath = await fs.mkdtemp(join(os.tmpdir(), 'youtubematic-'));
  return { ...baseConfig, downloadPath: tempDownloadPath };
}

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no environment variables are set', () => {
    delete process.env.DOWNLOAD_PATH;
    delete process.env.CHANNELS;
    delete process.env.MAX_EPISODES;
    delete process.env.MAX_AGE_DAYS;
    delete process.env.YT_DLP_PATH;

    const config = getConfig(envSchema);

    expect(config.downloadPath).toBe('/mnt/downloads');
    expect(config.channels).toEqual([]);
    expect(config.maxEpisodes).toBeNull();
    expect(config.maxAgeDays).toBeNull();
    expect(config.ytDlpPath).toBe('yt-dlp');
  });

  it('should read DOWNLOAD_PATH from environment', () => {
    process.env.DOWNLOAD_PATH = '/custom/path';

    const config = getConfig(envSchema);

    expect(config.downloadPath).toBe('/custom/path');
  });

  it('should parse comma-separated CHANNELS', () => {
    process.env.CHANNELS = 'https://www.youtube.com/@channel1,https://www.youtube.com/@channel2';

    const config = getConfig(envSchema);

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should parse newline-separated CHANNELS', () => {
    process.env.CHANNELS = 'https://www.youtube.com/@channel1\nhttps://www.youtube.com/@channel2';

    const config = getConfig(envSchema);

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should trim whitespace from channel entries', () => {
    process.env.CHANNELS =
      ' https://www.youtube.com/@channel1 , https://www.youtube.com/@channel2 ';

    const config = getConfig(envSchema);

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should parse MAX_EPISODES as a number', () => {
    process.env.MAX_EPISODES = '5';

    const config = getConfig(envSchema);

    expect(config.maxEpisodes).toBe(5);
  });

  it('should return null for MAX_EPISODES when not set', () => {
    delete process.env.MAX_EPISODES;

    const config = getConfig(envSchema);

    expect(config.maxEpisodes).toBeNull();
  });

  it('should parse MAX_AGE_DAYS as a number', () => {
    process.env.MAX_AGE_DAYS = '30';

    const config = getConfig(envSchema);

    expect(config.maxAgeDays).toBe(30);
  });

  it('should return null for MAX_AGE_DAYS when not set', () => {
    delete process.env.MAX_AGE_DAYS;

    const config = getConfig(envSchema);

    expect(config.maxAgeDays).toBeNull();
  });

  it('should read YT_DLP_PATH from environment', () => {
    process.env.YT_DLP_PATH = '/usr/local/bin/yt-dlp';

    const config = getConfig(envSchema);

    expect(config.ytDlpPath).toBe('/usr/local/bin/yt-dlp');
  });

  it('should return null for CRON_PATTERN when not set', () => {
    delete process.env.CRON_PATTERN;

    const config = getConfig(envSchema);

    expect(config.cronPattern).toBeNull();
  });

  it('should read CRON_PATTERN from environment', () => {
    process.env.CRON_PATTERN = '0 * * * *';

    const config = getConfig(envSchema);

    expect(config.cronPattern).toBe('0 * * * *');
  });
});

describe('buildYtDlpArgs', () => {
  it('should include the channel URL as the last argument', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);

    expect(args[args.length - 1]).toBe(TEST_CHANNEL);
  });

  it('should include the correct output template', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);
    const outputIndex = args.indexOf('--output');

    expect(outputIndex).toBeGreaterThan(-1);
    expect(args[outputIndex + 1]).toBe(join('/mnt/downloads', '%(uploader)s', '%(title)s.%(ext)s'));
  });

  it('should include --playlist-end when maxEpisodes is set', () => {
    const config: Config = { ...baseConfig, maxEpisodes: 10 };
    const args = buildYtDlpArgs(TEST_CHANNEL, config);
    const playlistEndIndex = args.indexOf('--playlist-end');

    expect(playlistEndIndex).toBeGreaterThan(-1);
    expect(args[playlistEndIndex + 1]).toBe('10');
  });

  it('should not include --playlist-end when maxEpisodes is null', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);

    expect(args).not.toContain('--playlist-end');
  });

  it('should include format options, metadata flags, and download archive', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);

    expect(args).toContain('--format');
    expect(args).toContain(
      'bestvideo[ext=mp4][vcodec*=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]'
    );
    expect(args).toContain('--merge-output-format');
    expect(args).toContain('mp4');
    expect(args).toContain('--embed-chapters');
    expect(args).toContain('--add-metadata');
  });

  it('should include a JavaScript runtime for yt-dlp extraction', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);
    const jsRuntimeIndex = args.indexOf('--js-runtimes');

    expect(jsRuntimeIndex).toBeGreaterThan(-1);
    expect(args[jsRuntimeIndex + 1]).toBe('node');
  });

  it('should include --dateafter when maxAgeDays is set', () => {
    const config: Config = { ...baseConfig, maxAgeDays: 7 };
    const args = buildYtDlpArgs(TEST_CHANNEL, config);
    const dateAfterIndex = args.indexOf('--dateafter');

    expect(dateAfterIndex).toBeGreaterThan(-1);
    expect(args[dateAfterIndex + 1]).toBe('today-7day');
  });

  it('should not include --dateafter when maxAgeDays is null', () => {
    const args = buildYtDlpArgs(TEST_CHANNEL, baseConfig);

    expect(args).not.toContain('--dateafter');
  });
});

describe('downloadChannel', () => {
  function makeFakeChild(exitCode: number | null = 0): EventEmitter {
    const child = new EventEmitter();
    setTimeout(() => child.emit('close', exitCode), 20);
    return child;
  }

  afterEach(async () => {
    if (tempDownloadPath) {
      await fs.rm(tempDownloadPath, { recursive: true, force: true });
      tempDownloadPath = '';
    }
  });

  it('should resolve when yt-dlp exits with code 0', async () => {
    const config = await makeTempDownloadConfig();
    mockSpawn.mockReturnValueOnce(makeFakeChild(0) as ReturnType<typeof spawn>);

    await expect(downloadChannel(TEST_CHANNEL, config)).resolves.toEqual(
      expect.objectContaining({ code: 0, downloadedFiles: [] })
    );
  });

  it('should reject when yt-dlp exits with a non-zero code', async () => {
    const config = await makeTempDownloadConfig();
    mockSpawn.mockReturnValueOnce(makeFakeChild(1) as ReturnType<typeof spawn>);

    await expect(downloadChannel(TEST_CHANNEL, config)).rejects.toThrow(
      'yt-dlp exited with code 1'
    );
  });

  it('should reject when spawn emits an error', async () => {
    const config = await makeTempDownloadConfig();
    const child = new EventEmitter();
    setTimeout(() => child.emit('error', new Error('spawn ENOENT')), 20);
    mockSpawn.mockReturnValueOnce(child as ReturnType<typeof spawn>);

    await expect(downloadChannel(TEST_CHANNEL, config)).rejects.toThrow('spawn ENOENT');
  });

  it('should call spawn with the correct yt-dlp path and channel args', async () => {
    const config = await makeTempDownloadConfig();
    mockSpawn.mockReturnValueOnce(makeFakeChild(0) as ReturnType<typeof spawn>);

    await downloadChannel(TEST_CHANNEL, config);

    expect(mockSpawn).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([TEST_CHANNEL]),
      expect.any(Object)
    );
  });

  it('should detect newly created files after yt-dlp exits', async () => {
    const config = await makeTempDownloadConfig();
    const child = makeFakeChild(0);
    mockSpawn.mockReturnValueOnce(child as ReturnType<typeof spawn>);

    setTimeout(() => {
      void (async () => {
        await fs.mkdir(join(config.downloadPath, 'LowkoTV'), { recursive: true });
        await fs.writeFile(join(config.downloadPath, 'LowkoTV', 'video.mp4'), 'dummy');
      })();
    }, 10);

    await expect(downloadChannel(TEST_CHANNEL, config)).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        downloadedFiles: [join('LowkoTV', 'video.mp4')],
      })
    );
  });
});
