FROM node:22-bookworm-slim

# YouTube/MP3 requirements:
# - ffmpeg converts YouTube audio to MP3
# - python is kept available for yt-dlp compatibility
# - Deno is the recommended JS runtime for yt-dlp's current YouTube EJS solver
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl unzip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | sh \
  && mv /root/.deno/bin/deno /usr/local/bin/deno \
  && chmod +x /usr/local/bin/deno \
  && deno --version

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PATH="/usr/local/bin:${PATH}"
ENV DENO_NO_UPDATE_CHECK="1"

EXPOSE 3000
CMD ["node", "runner.js"]
