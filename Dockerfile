FROM node:23.3.0-slim

# Install openssl
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./

RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
