FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-calc libreoffice-draw libreoffice-impress libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV API_PORT=3001
ENV LIBRAAI_DB_PATH=/app/data/libraai.sqlite
ENV LIBRAAI_UPLOAD_DIR=/app/data/uploads

EXPOSE 3001
CMD ["node", "server/index.js"]
