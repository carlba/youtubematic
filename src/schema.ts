import { z } from 'zod';

const defaultString = (defaultValue: string) => z.string().trim().min(1).default(defaultValue);

const defaultUrl = (defaultValue: string) => z.string().trim().min(1).url().default(defaultValue);

const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform(value => value ?? null);

const optionalNumber = z
  .preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().optional()
  )
  .transform(value => value ?? null);

const channels = z
  .string()
  .trim()
  .min(1)
  .transform(value =>
    value
      .split(/[\n,]/)
      .map(channel => channel.trim())
      .filter(channel => channel.length > 0)
  )
  .optional()
  .transform(value => value ?? []);

export const envSchema = z
  .object({
    DOWNLOAD_PATH: defaultString('/mnt/downloads'),
    CHANNELS: channels,
    MAX_EPISODES: optionalNumber,
    MAX_AGE_DAYS: optionalNumber,
    YT_DLP_PATH: defaultString('yt-dlp'),
    CRON_PATTERN: optionalString,
    MATCH_FILTER: optionalString,
    PLEX_URL: defaultUrl('http://plex:32400'),
    PLEX_TOKEN: optionalString,
    PLEX_SECTION_ID: optionalString,
    PUSHOVER_URL: defaultUrl('https://api.pushover.net/1/messages.json'),
    PUSHOVER_TOKEN: optionalString,
    PUSHOVER_USER: optionalString,
  })
  .transform(raw => ({
    downloadPath: raw.DOWNLOAD_PATH,
    channels: raw.CHANNELS,
    maxEpisodes: raw.MAX_EPISODES,
    maxAgeDays: raw.MAX_AGE_DAYS,
    ytDlpPath: raw.YT_DLP_PATH,
    cronPattern: raw.CRON_PATTERN,
    matchFilter: raw.MATCH_FILTER,
    plexUrl: raw.PLEX_URL,
    plexToken: raw.PLEX_TOKEN,
    plexSectionId: raw.PLEX_SECTION_ID,
    pushoverUrl: raw.PUSHOVER_URL,
    pushoverToken: raw.PUSHOVER_TOKEN,
    pushoverUser: raw.PUSHOVER_USER,
  }));

export type Config = z.infer<typeof envSchema>;
