import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

import { getConfig, buildYtDlpArgs, downloadChannel } from './index.js';
import type { Config } from './index.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no environment variables are set', () => {
    delete process.env['DOWNLOAD_PATH'];
    delete process.env['CHANNELS'];
    delete process.env['MAX_EPISODES'];
    delete process.env['YT_DLP_PATH'];

    const config = getConfig();

    expect(config.downloadPath).toBe('/mnt/downloads');
    expect(config.channels).toEqual([]);
    expect(config.maxEpisodes).toBeNull();
    expect(config.ytDlpPath).toBe('yt-dlp');
  });

  it('should read DOWNLOAD_PATH from environment', () => {
    process.env['DOWNLOAD_PATH'] = '/custom/path';

    const config = getConfig();

    expect(config.downloadPath).toBe('/custom/path');
  });

  it('should parse comma-separated CHANNELS', () => {
    process.env['CHANNELS'] = 'https://www.youtube.com/@channel1,https://www.youtube.com/@channel2';

    const config = getConfig();

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should parse newline-separated CHANNELS', () => {
    process.env['CHANNELS'] =
      'https://www.youtube.com/@channel1\nhttps://www.youtube.com/@channel2';

    const config = getConfig();

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should trim whitespace from channel entries', () => {
    process.env['CHANNELS'] =
      ' https://www.youtube.com/@channel1 , https://www.youtube.com/@channel2 ';

    const config = getConfig();

    expect(config.channels).toEqual([
      'https://www.youtube.com/@channel1',
      'https://www.youtube.com/@channel2',
    ]);
  });

  it('should parse MAX_EPISODES as a number', () => {
    process.env['MAX_EPISODES'] = '5';

    const config = getConfig();

    expect(config.maxEpisodes).toBe(5);
  });

  it('should return null for MAX_EPISODES when not set', () => {
    delete process.env['MAX_EPISODES'];

    const config = getConfig();

    expect(config.maxEpisodes).toBeNull();
  });

  it('should read YT_DLP_PATH from environment', () => {
    process.env['YT_DLP_PATH'] = '/usr/local/bin/yt-dlp';

    const config = getConfig();

    expect(config.ytDlpPath).toBe('/usr/local/bin/yt-dlp');
  });
});

describe('buildYtDlpArgs', () => {
  const baseConfig: Config = {
    downloadPath: '/mnt/downloads',
    channels: [],
    maxEpisodes: null,
    ytDlpPath: 'yt-dlp',
  };

  it('should include the channel URL as the last argument', () => {
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, baseConfig);

    expect(args[args.length - 1]).toBe(channel);
  });

  it('should include the correct output template', () => {
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, baseConfig);
    const outputIndex = args.indexOf('--output');

    expect(outputIndex).toBeGreaterThan(-1);
    expect(args[outputIndex + 1]).toBe(join('/mnt/downloads', '%(uploader)s', '%(title)s.%(ext)s'));
  });

  it('should include --playlist-end when maxEpisodes is set', () => {
    const config: Config = { ...baseConfig, maxEpisodes: 10 };
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, config);
    const playlistEndIndex = args.indexOf('--playlist-end');

    expect(playlistEndIndex).toBeGreaterThan(-1);
    expect(args[playlistEndIndex + 1]).toBe('10');
  });

  it('should not include --playlist-end when maxEpisodes is null', () => {
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, baseConfig);

    expect(args).not.toContain('--playlist-end');
  });

  it('should include format options', () => {
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, baseConfig);

    expect(args).toContain('--format');
    expect(args).toContain('--merge-output-format');
    expect(args).toContain('mp4');
  });

  it('should include a JavaScript runtime for yt-dlp extraction', () => {
    const channel = 'https://www.youtube.com/@testchannel';
    const args = buildYtDlpArgs(channel, baseConfig);
    const jsRuntimeIndex = args.indexOf('--js-runtimes');

    expect(jsRuntimeIndex).toBeGreaterThan(-1);
    expect(args[jsRuntimeIndex + 1]).toBe('node');
  });
});

describe('downloadChannel', () => {
  const baseConfig: Config = {
    downloadPath: '/mnt/downloads',
    channels: [],
    maxEpisodes: null,
    ytDlpPath: 'yt-dlp',
  };

  function makeFakeChild(exitCode: number | null = 0): EventEmitter {
    const child = new EventEmitter();
    setTimeout(() => child.emit('close', exitCode), 0);
    return child;
  }

  it('should resolve when yt-dlp exits with code 0', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild(0) as ReturnType<typeof spawn>);

    await expect(
      downloadChannel('https://www.youtube.com/@testchannel', baseConfig)
    ).resolves.toBeUndefined();
  });

  it('should reject when yt-dlp exits with a non-zero code', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild(1) as ReturnType<typeof spawn>);

    await expect(
      downloadChannel('https://www.youtube.com/@testchannel', baseConfig)
    ).rejects.toThrow('yt-dlp exited with code 1');
  });

  it('should reject when spawn emits an error', async () => {
    const child = new EventEmitter();
    setTimeout(() => child.emit('error', new Error('spawn ENOENT')), 0);
    mockSpawn.mockReturnValueOnce(child as ReturnType<typeof spawn>);

    await expect(
      downloadChannel('https://www.youtube.com/@testchannel', baseConfig)
    ).rejects.toThrow('spawn ENOENT');
  });

  it('should call spawn with the correct yt-dlp path and channel args', async () => {
    mockSpawn.mockReturnValueOnce(makeFakeChild(0) as ReturnType<typeof spawn>);

    const channel = 'https://www.youtube.com/@testchannel';
    await downloadChannel(channel, baseConfig);

    expect(mockSpawn).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([channel]),
      expect.any(Object)
    );
  });
});
