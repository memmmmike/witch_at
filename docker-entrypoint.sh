#!/bin/sh
# Witchat Docker Entrypoint
# Runs both Next.js and Socket.io server with proper signal handling

# Trap signals for graceful shutdown
cleanup() {
    echo "Shutting down witchat..."
    kill -TERM "$SOCKET_PID" 2>/dev/null || true
    kill -TERM "$NEXT_PID" 2>/dev/null || true
    wait
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

echo "=== Starting Witchat ==="
echo "SOCKET_PORT: ${SOCKET_PORT:-4001}"
echo "CORS_ORIGIN: ${CORS_ORIGIN:-not set}"

# Start socket server in background
echo "[1/2] Starting socket server..."
node socket-server.js &
SOCKET_PID=$!

# Wait for socket server to be ready
sleep 2

if ! kill -0 "$SOCKET_PID" 2>/dev/null; then
    echo "Socket server failed to start"
    exit 1
fi

# Start Next.js in background
echo "[2/2] Starting Next.js server..."
npm run start:next &
NEXT_PID=$!

echo "=== Witchat running ==="
echo "  Next.js:  http://localhost:3000"
echo "  Socket:   http://localhost:${SOCKET_PORT:-4001}"

# Wait for all background processes
wait
