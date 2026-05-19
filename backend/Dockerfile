# ==========================================
# STAGE 1: Build the Go binary
# ==========================================
# UPDATED: Using Go 1.25 to match your go.mod requirements
FROM golang:1.25-alpine AS builder

WORKDIR /app

# 1. Copy the source code FIRST
COPY . .

# 2. Pin Gin to a stable version to prevent toolchain errors
RUN go get github.com/gin-gonic/gin@v1.10.0

# 3. Automatically download the rest of the dependencies
RUN go mod tidy

# 4. Compile the Go application statically
RUN CGO_ENABLED=0 GOOS=linux go build -o /ccf-backend

# ==========================================
# STAGE 2: Create a tiny production image
# ==========================================
FROM alpine:latest

WORKDIR /

# Create a non-root user for security
RUN adduser -D -g '' appuser

# Copy ONLY the compiled binary from Stage 1
COPY --from=builder /ccf-backend /ccf-backend

# Ensure the binary is executable by the new user
RUN chown appuser:appuser /ccf-backend

# Drop root privileges
USER appuser

EXPOSE 8080

ENTRYPOINT ["/ccf-backend"]
