# youtubematic

A TypeScript script that automatically downloads YouTube subscriptions to a configurable path on disk using [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Features

- Downloads videos from one or more YouTube channels
- Configurable download path
- Optionally limit downloads to the latest N episodes per channel
- Optionally limit downloads to entries from the last N days
- Fully dockerized
- All settings configurable via environment variables

## Configuration

Copy `.env.example` to `.env` and edit the values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `DOWNLOAD_PATH` | Path where downloaded videos are stored | `/mnt/downloads` |
| `CHANNELS` | Comma or newline-separated list of YouTube channel URLs | _(required)_ |
| `MAX_EPISODES` | Maximum number of latest episodes to download per channel | _(no limit)_ |
| `MAX_AGE_DAYS` | Only download entries uploaded within the last N days | _(no limit)_ |
| `YT_DLP_PATH` | Path to the `yt-dlp` binary | `yt-dlp` |
| `CRON_PATTERN` | CRON schedule for repeated runs | _(run once and exit)_ |

### Example `.env`

```env
DOWNLOAD_PATH=/mnt/downloads
CHANNELS=https://www.youtube.com/@SomeChannel,https://www.youtube.com/@AnotherChannel
MAX_EPISODES=10
MAX_AGE_DAYS=30
CRON_PATTERN=0 * * * *
```

## Running with Docker Compose

```bash
docker compose up
```

Downloads are organized under `DOWNLOAD_PATH` in subdirectories per channel uploader:

```
/mnt/downloads/
  ChannelName/
    Video Title.mp4
    Another Video.mp4
  AnotherChannel/
    Episode.mp4
```

## Running locally

### Prerequisites

- Node.js (see `.nvmrc` for version)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and available in `PATH`
- [ffmpeg](https://ffmpeg.org/) installed

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run

```bash
CHANNELS="https://www.youtube.com/@SomeChannel" MAX_EPISODES=5 MAX_AGE_DAYS=30 npm start
```

### Development

```bash
npm run start:dev
```

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

