#!/bin/bash
# Start witchat services after reboot

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting witchat services..."
echo ""

SOCKET_PORT=4001
FRONTEND_PORT=3000

# Function to check if port is in use
check_port() {
    python3 -c "import socket; s = socket.socket(); s.settimeout(0.1); result = s.connect_ex(('127.0.0.1', $1)); s.close(); exit(0 if result == 0 else 1)" 2>/dev/null
}

# Load production environment
if [ -f ".env.production" ]; then
    export $(grep -v '^#' .env.production | xargs)
    echo "Loaded .env.production"
fi

# Wait for network
echo "Waiting for network..."
sleep 2

# Build if needed
if [ ! -d ".next" ]; then
    echo "Building Next.js app..."
    npm run build
fi

# Start socket server
echo "Starting socket server..."
if check_port $SOCKET_PORT; then
    echo "   Socket server already running on port $SOCKET_PORT"
else
    node socket-server.js > /tmp/witchat_socket.log 2>&1 &
    SOCKET_PID=$!
    echo "   Socket server started (PID: $SOCKET_PID)"
    sleep 2
fi

# Start frontend
echo "Starting frontend..."
if check_port $FRONTEND_PORT; then
    echo "   Frontend already running on port $FRONTEND_PORT"
else
    npm run start > /tmp/witchat_frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "   Frontend started (PID: $FRONTEND_PID)"
    sleep 3
fi

# Check Cloudflare tunnel
echo "Checking Cloudflare tunnel..."
if pgrep -f "cloudflared.*witchat" > /dev/null; then
    echo "   Cloudflare tunnel already running"
else
    if [ -f "cloudflare-tunnel.yml" ] && command -v cloudflared &> /dev/null; then
        cloudflared tunnel --config cloudflare-tunnel.yml run > /tmp/witchat_tunnel.log 2>&1 &
        TUNNEL_PID=$!
        echo "   Cloudflare tunnel started (PID: $TUNNEL_PID)"
    else
        echo "   Cloudflare tunnel not started (missing config or cloudflared)"
    fi
fi

echo ""
echo "All services started!"
echo ""
echo "Service URLs:"
echo "  Socket:   http://localhost:$SOCKET_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Public:   https://witchat.0pon.com"
echo ""
echo "View logs:"
echo "  Socket:   tail -f /tmp/witchat_socket.log"
echo "  Frontend: tail -f /tmp/witchat_frontend.log"
echo "  Tunnel:   tail -f /tmp/witchat_tunnel.log"
