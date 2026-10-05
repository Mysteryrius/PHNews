FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 3000
CMD ["node", "server.js"]
