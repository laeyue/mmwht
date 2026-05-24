# ==========================================
# Phase 1: Build the Vite frontend assets
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the frontend bundle
RUN npm run build

# ==========================================
# Phase 2: Create the production image
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy static frontend assets built in the builder stage
COPY --from=builder /app/dist ./dist

# Copy the backend files
COPY backend ./backend

# Expose the default application port
EXPOSE 4000

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/app/data/database.json

# Start the Node.js server
CMD ["npm", "start"]
