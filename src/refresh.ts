import { getConfig } from './lib/config.js';
import { refreshPlex } from './plex.js';
import { envSchema } from './schema.js';

const config = getConfig(envSchema);

await refreshPlex('/streaming/youtube', config, 'reason');
