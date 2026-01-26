FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source
COPY src/ ./src/
COPY bin/ ./bin/

# Build TypeScript
RUN npm run build

# Create a symlink for the CLI
RUN npm link

# Default command
CMD ["zyphron", "--help"]
