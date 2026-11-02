#!/usr/bin/env bash
set -e
cd ~/time-organizer
git pull origin main
cd ~/time-organizer/frontend && npm install && npm run build
cd ~/time-organizer/backend && npm install
pm2 restart time-organizer || pm2 start "npx tsx src/server.ts" --name time-organizer
