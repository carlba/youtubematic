import { describe, it, expect, beforeEach, vi } from 'vitest';
import { refreshPlex } from './plex.js';
import type { Config } from './lib/config.js';

const { getMock, postMock, extendMock } = vi.hoisted(() => {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const extendMock = vi.fn(() => ({ get: getMock, post: postMock }));
  return { getMock, postMock, extendMock };
});

vi.mock('got', () => ({
  default: { extend: extendMock },
}));

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
    extendMock.mockReset();
    extendMock.mockReturnValue({ get: getMock, post: postMock });
  });

  it('should refresh Plex and return true when one request succeeds', async () => {
    getMock.mockResolvedValueOnce({ statusCode: 200 });

    const result = await refreshPlex('/mnt/downloads', baseConfig, 'The cause');

    expect(result).toBe(true);
    expect(extendMock).toHaveBeenCalledWith({
      prefixUrl: 'http://localhost:32400',
      searchParams: { 'X-Plex-Token': 'token' },
    });
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('library/sections/2/refresh', {
      searchParams: { path: '/mnt/downloads' },
    });
  });

  it('should return false when PLEX_TOKEN is missing', async () => {
    const result = await refreshPlex(
      '/mnt/downloads',
      { ...baseConfig, plexToken: null },
      'The Cause'
    );

    expect(result).toBe(false);
    expect(extendMock).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });
});
