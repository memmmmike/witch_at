#!/usr/bin/env bash
set -e

cd /home/mlayug/witchat

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Building Next.js..."
NEXT_PUBLIC_SOCKET_URL=https://witchat.0pon.com npm run build

echo "Restarting services..."
sudo systemctl restart witchat

echo "Deploy complete!"
