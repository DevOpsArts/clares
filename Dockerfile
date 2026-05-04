# Stage 1: Build frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package.json and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3002

CMD ["node", "server/index.js"]
