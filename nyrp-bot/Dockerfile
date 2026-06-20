FROM node:20-alpine

# Install build tools for better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Create persistent data directory
RUN mkdir -p /data

# Expose data directory as a volume mount point
VOLUME ["/data"]

# Set data directory env var (used by db.js)
ENV DATA_DIR=/data

CMD ["node", "index.js"]
