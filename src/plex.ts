import got from 'got';
import type { Config } from './lib/config.js';

export const httpClient = got.extend({
  throwHttpErrors: false,
  timeout: {
    request: 10000,
  },
  retry: {
    limit: 2,
  },
});

async function fetchStatus(
  path: string,
  baseUrl: string,
  searchParams: Record<string, string>
): Promise<number> {
  try {
    const response = await httpClient.get(path, { prefixUrl: baseUrl, searchParams });
    return response.statusCode ?? 0;
  } catch {
    return 0;
  }
}

async function refreshSection(
  path: string,
  baseUrl: string,
  searchParams: Record<string, string>,
  label: string
): Promise<boolean> {
  const status = await fetchStatus(path, baseUrl, searchParams);

  console.log(`Plex refresh HTTP status for ${label}: ${status}`);
  if (status === 200 || status === 201 || status === 204) {
    return true;
  }

  console.log(`WARNING: Plex refresh request failed for ${label} (HTTP ${status})`);
  return false;
}

async function notifyPushover(message: string, config: Config): Promise<void> {
  if (!config.pushoverToken || !config.pushoverUser) {
    return;
  }

  try {
    const response = await httpClient.post(config.pushoverUrl, {
      form: {
        token: config.pushoverToken,
        user: config.pushoverUser,
        title: 'yt-dlp -> Plex Refresh',
        message,
      },
    });

    if (response.statusCode === 200) {
      console.log('Pushover notification sent');
    } else {
      console.log(`WARNING: Pushover notification failed (${response.statusCode})`);
    }
  } catch (error: unknown) {
    const detail =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
    console.log(`WARNING: Failed to send Pushover notification (${detail})`);
  }
}

export async function refreshPlex(downloadPath: string, config: Config): Promise<boolean> {
  if (!config.plexToken) {
    console.log('WARNING: PLEX_TOKEN missing, skipping Plex refresh');
    return false;
  }

  if (!config.plexSectionId) {
    console.log('WARNING: PLEX_SECTION_ID missing, skipping Plex refresh');
    return false;
  }

  const searchParams: Record<string, string> = {
    'X-Plex-Token': config.plexToken,
  };

  if (downloadPath) {
    searchParams.path = downloadPath;
  }

  const success = await refreshSection(
    `library/sections/${config.plexSectionId}/refresh`,
    config.plexUrl,
    searchParams,
    'Youtube'
  );

  if (success) {
    await notifyPushover(
      `Plex refresh triggered by completed yt-dlp download run (path: ${downloadPath || 'n/a'})`,
      config
    );
  }

  return success;
}
