FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# All server modules (index.mjs imports ledger/telegramAuth/payments).
COPY *.mjs ./
ENV PORT=8000
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "index.mjs"]
