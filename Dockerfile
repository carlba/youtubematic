# Use the latest Node.js LTS runtime as a parent image
FROM node:lts-alpine

# Install yt-dlp dependencies and yt-dlp itself
RUN apk add --no-cache ffmpeg python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json .

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

VOLUME /mnt

# Run the script
CMD ["node", "dist/index.js"]
