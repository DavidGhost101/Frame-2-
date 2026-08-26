# --- Build stage: needs devDependencies (tailwindcss) to compile the CSS ---
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:css

# --- Runtime stage: production dependencies only, plus the compiled output ---
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
COPY models ./models
COPY routes ./routes
COPY middleware ./middleware
COPY services ./services
COPY --from=build /usr/src/app/public ./public

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
