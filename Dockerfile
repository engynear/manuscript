FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/.cache /app/public/generated

EXPOSE 3000

CMD ["npm", "run", "start"]
