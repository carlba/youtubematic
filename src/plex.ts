import got from 'got';
import type { Config } from './lib/config.js';
import { handleGotError } from './lib/utils.js';

function createPlexClient(config: { plexUrl: string; plexToken: string }) {
  return got.extend({
    prefixUrl: config.plexUrl,
    searchParams: { 'X-Plex-Token': config.plexToken },
  });
}

function validatePushoverConfig(
  config: Config
): config is Config & { pushoverToken: string; pushoverUser: string; pushoverUrl: string } {
  if (!config.pushoverToken) {
    console.log('WARNING: PUSHOVER_TOKEN missing, skipping notification');
    return false;
  }
  if (!config.pushoverUser) {
    console.log('WARNING: PUSHOVER_USER is missing, skipping notification');
    return false;
  }
  if (!config.pushoverUrl) {
    console.log('WARNING: PUSHOVER_URL missing, skipping notification');
    return false;
  }
  return true;
}

async function notifyPushover(message: string, config: Config): Promise<void> {
  if (!validatePushoverConfig(config)) {
    return;
  }

  try {
    await got.post('', {
      prefixUrl: config.pushoverUrl,
      form: {
        title: 'yt-dlp -> Plex Refresh',
        message,
        token: config.pushoverToken,
        user: config.pushoverUser,
      },
    });
  } catch (error: unknown) {
    handleGotError(error, 'sending Pushover notification', 'silence');
  }
}

function validatePlexConfig(
  config: Config
): config is Config & { plexToken: string; plexSectionId: string; plexUrl: string } {
  if (!config.plexToken) {
    console.log('WARNING: PLEX_TOKEN missing, skipping Plex refresh');
    return false;
  }
  if (!config.plexSectionId) {
    console.log('WARNING: PLEX_SECTION_ID missing, skipping Plex refresh');
    return false;
  }
  if (!config.plexUrl) {
    console.log('WARNING: PLEX_URL missing, skipping Plex refresh');
    return false;
  }
  return true;
}

export async function refreshPlex(
  downloadPath: string,
  config: Config,
  cause: string
): Promise<boolean> {
  if (!validatePlexConfig(config)) {
    return false;
  }
  const plexClient = createPlexClient(config);

  const searchParams = downloadPath ? { path: downloadPath } : {};

  try {
    const plexRefreshUrl = `library/sections/${config.plexSectionId}/refresh`;
    const { statusCode } = await plexClient.get(plexRefreshUrl, { searchParams });
    console.log(`Plex refresh HTTP status for Youtube: ${statusCode}`);
  } catch (error: unknown) {
    return handleGotError(error, 'refreshing Plex section', 'silence');
  }

  await notifyPushover(cause, config);
  return true;
}
