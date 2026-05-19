# ==========================================
# STAGE 1: Build the React application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies cleanly
COPY package*.json ./
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Compile the application (outputs to /app/dist)
RUN npm run build

# ==========================================
# STAGE 2: Serve the static files with Nginx
# ==========================================
# Using unprivileged Nginx image for security (runs as non-root)
FROM nginxinc/nginx-unprivileged:alpine

# Copy the custom Nginx routing configuration 
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy ONLY the compiled static files from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# The unprivileged image defaults to listening on 8080 internally instead of 80 to avoid root ports
CMD ["nginx", "-g", "daemon off;"]
