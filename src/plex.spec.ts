import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from './lib/config.js';

vi.mock('got', () => {
  const get = vi.fn();
  const post = vi.fn();
  const extend = vi.fn(() => ({ get, post }));
  const gotMock = Object.assign(
    vi.fn(() => ({ get, post })),
    { extend, get, post }
  );

  return { default: gotMock };
});

import got from 'got';
import { refreshPlex } from './lib/plex.js';

const baseConfig: Config = {
  downloadPath: '/downloads',
  channels: [],
  maxEpisodes: null,
  maxAgeDays: null,
  ytDlpPath: 'yt-dlp',
  cronPattern: null,
  matchFilter: null,
  plexUrl: 'http://localhost:32400',
  plexToken: 'token',
  plexSectionId: '2',
  plexBasePath: '/streaming/youtube',
  pushoverUrl: 'https://api.pushover.net/1/messages.json',
  pushoverToken: null,
  pushoverUser: null,
};

const mockedExtend: ReturnType<typeof vi.fn> = got.extend as unknown as ReturnType<typeof vi.fn>;
const mockedGot: {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} = got as unknown as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

describe('refreshPlex', () => {
  beforeEach(() => {
    mockedExtend.mockReset();
    mockedGot.post.mockReset();
    mockedGot.get.mockReset();
  });

  it('should refresh Plex and return true when one request succeeds', async () => {
    const mockClient = { get: vi.fn(() => Promise.resolve({ statusCode: 200 })) };
    mockedExtend.mockReturnValueOnce(mockClient);

    const result = await refreshPlex('/downloads', baseConfig, 'The cause');

    expect(result).toBe(true);
    expect(mockedExtend).toHaveBeenCalledWith({
      prefixUrl: 'http://localhost:32400',
      searchParams: { 'X-Plex-Token': 'token' },
    });
    expect(mockClient.get).toHaveBeenCalledWith('library/sections/2/refresh', {
      searchParams: { path: '/downloads' },
    });
  });

  it('should send the Plex refresh request to the correct path query parameter', async () => {
    const mockClient = {
      get: vi.fn(() => Promise.resolve({ statusCode: 200 })),
      post: vi.fn(() => Promise.resolve({ statusCode: 200 })),
    };
    mockedExtend.mockReturnValueOnce(mockClient);

    const configWithBasePath: Config = {
      ...baseConfig,
      plexBasePath: '/streaming/youtube',
    };

    const result = await refreshPlex(
      configWithBasePath.plexBasePath,
      configWithBasePath,
      'The cause'
    );

    expect(result).toBe(true);
    expect(mockClient.get).toHaveBeenCalledWith('library/sections/2/refresh', {
      searchParams: { path: '/streaming/youtube' },
    });
  });

  it('should notify Pushover using the root got client after a successful Plex refresh', async () => {
    const mockClient = { get: vi.fn(() => Promise.resolve({ statusCode: 200 })) };
    mockedExtend.mockReturnValueOnce(mockClient);

    const configWithPushover: Config = {
      ...baseConfig,
      pushoverToken: 'token',
      pushoverUser: 'user',
    };

    const result = await refreshPlex('/downloads', configWithPushover, 'The cause');

    expect(result).toBe(true);
    expect(mockedGot.post).toHaveBeenCalledWith('', {
      prefixUrl: 'https://api.pushover.net/1/messages.json',
      form: {
        title: 'yt-dlp -> Plex Refresh',
        message: 'The cause',
        token: 'token',
        user: 'user',
      },
    });
  });

  it('should return false when PLEX_TOKEN is missing', async () => {
    const result = await refreshPlex(
      '/downloads',
      { ...baseConfig, plexToken: null },
      'The Cause'
    );

    expect(result).toBe(false);
  });
});
