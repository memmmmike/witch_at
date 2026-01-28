#!/bin/bash
# Stop witchat services

echo "Stopping witchat services..."

# Kill socket server
if pgrep -f "node socket-server.js" > /dev/null; then
    pkill -f "node socket-server.js"
    echo "   Socket server stopped"
else
    echo "   Socket server not running"
fi

# Kill Next.js
if pgrep -f "next-server.*witchat" > /dev/null; then
    pkill -f "next-server.*witchat"
    echo "   Frontend stopped"
elif pgrep -f "npm.*start" > /dev/null; then
    # Try broader match
    pkill -f "node.*\.next"
    echo "   Frontend stopped"
else
    echo "   Frontend not running"
fi

# Kill tunnel (optional - comment out if you want tunnel to stay up)
# if pgrep -f "cloudflared.*witchat" > /dev/null; then
#     pkill -f "cloudflared.*witchat"
#     echo "   Tunnel stopped"
# fi

echo ""
echo "Witchat services stopped"
