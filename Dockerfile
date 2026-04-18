# Use official Node.js image
FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for tsx)
RUN npm install

# Copy application code
COPY . .

# Build the frontend
RUN npm run build

# Expose port (Infrastructure hardcodes 3000)
EXPOSE 3000

# Start command
CMD ["npm", "start"]
