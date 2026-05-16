import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Cron } from 'croner';
import { refreshPlex } from './lib/plex.js';
import { downloadChannel } from './lib/channel.js';
import { getConfig, type Config } from './lib/config.js';
import { envSchema } from './schema.js';
import path from 'node:path';

export { buildYtDlpArgs, downloadChannel } from './lib/channel.js';

function setupSignalForwarding(controller: AbortController): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

  for (const signal of signals) {
    process.on(signal, () => {
      controller.abort(signal);
      process.exit(0);
    });
  }
}

export async function runOnce(config: Config, signal?: AbortSignal): Promise<void> {
  mkdirSync(config.downloadPath, { recursive: true });

  for (const channel of config.channels) {
    try {
      const { downloadedFiles } = await downloadChannel(channel, config, signal);
      if (downloadedFiles.length > 0) {
        console.log(`Downloaded ${downloadedFiles.length} new file(s) for ${channel}`);
        const plexRefreshPath = path.join(config.plexBasePath, path.dirname(downloadedFiles[0]));
        await refreshPlex(
          plexRefreshPath,
          config,
          `There are new episodes for ${channel} refreshing path for ${plexRefreshPath}`
        );
      } else {
        console.log(`No new downloads for ${channel}`);
      }
    } catch (error) {
      console.error(`Failed to download from ${channel}:`, error);
    }
  }
}

async function run(config: Config, signal?: AbortSignal): Promise<void> {
  if (config.channels.length === 0) {
    console.error('No channels configured. Set the CHANNELS environment variable.');
    process.exit(1);
  }

  console.log({ config }, 'config');

  if (config.cronPattern) {
    console.log(`Scheduling downloads using CRON pattern: ${config.cronPattern}`);
    new Cron(config.cronPattern, () => {
      console.log('Running scheduled download cycle');
      void runOnce(config, signal).catch(error => {
        console.error('Scheduled download cycle failed:', error);
      });
    });
    await runOnce(config, signal);
    console.log('Scheduler initialized, running continuously.');
    return;
  }

  console.log('Download running once due to no CRON pattern configured');
  await runOnce(config);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const abortController = new AbortController();
  setupSignalForwarding(abortController);
  run(getConfig(envSchema), abortController.signal).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
