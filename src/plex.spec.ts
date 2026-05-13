import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env['PLEX_TOKEN'] = 'token';
  process.env['PLEX_URL'] = 'http://localhost:32400';
  process.env['PLEX_SECTION_ID'] = '2';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe('refreshPlex', () => {
  it('should refresh Plex and return true when one request succeeds', async () => {
    const { refreshPlex } = await import('./plex.js');
    const fetchMock = vi.mocked(global.fetch as typeof fetch);
    fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

    const result = await refreshPlex('/mnt/downloads');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:32400/library/sections/2/refresh?X-Plex-Token=token&path=%2Fmnt%2Fdownloads',
      { method: 'GET' }
    );
  });

  it('should return false when PLEX_TOKEN is missing', async () => {
    delete process.env['PLEX_TOKEN'];
    const { refreshPlex } = await import('./plex.js');

    const result = await refreshPlex('/mnt/downloads');

    expect(result).toBe(false);
  });
});
