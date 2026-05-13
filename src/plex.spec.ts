import { describe, it, expect, beforeEach, vi } from 'vitest';
import { refreshPlex, httpClient } from './plex.js';
import type { Config } from './lib/config.js';

const getMock = vi.fn();
const postMock = vi.fn();

const baseConfig: Config = {
  downloadPath: '/mnt/downloads',
  channels: [],
  maxEpisodes: null,
  maxAgeDays: null,
  ytDlpPath: 'yt-dlp',
  cronPattern: null,
  matchFilter: null,
  plexUrl: 'http://localhost:32400',
  plexToken: 'token',
  plexSectionId: '2',
  pushoverUrl: 'https://api.pushover.net/1/messages.json',
  pushoverToken: null,
  pushoverUser: null,
};

describe('refreshPlex', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    Object.assign(httpClient, {
      get: getMock,
      post: postMock,
    });
  });

  it('should refresh Plex and return true when one request succeeds', async () => {
    getMock.mockResolvedValueOnce({ statusCode: 200 });

    const result = await refreshPlex('/mnt/downloads', baseConfig);

    expect(result).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('library/sections/2/refresh', {
      prefixUrl: 'http://localhost:32400',
      searchParams: {
        'X-Plex-Token': 'token',
        path: '/mnt/downloads',
      },
    });
  });

  it('should return false when PLEX_TOKEN is missing', async () => {
    const result = await refreshPlex('/mnt/downloads', { ...baseConfig, plexToken: null });

    expect(result).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });
});
