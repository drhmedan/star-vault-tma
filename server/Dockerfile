FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.mjs ./
ENV PORT=8000
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "index.mjs"]
