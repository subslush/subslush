#!/bin/bash

# Start ngrok in background
ngrok http 3001 > /dev/null &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -1)

echo "╔════════════════════════════════════════════════════════╗"
echo "║  Ngrok tunnel established!                             ║"
echo "║  Webhook URL: $NGROK_URL/api/v1/payments/webhook       ║"
echo "║                                                        ║"
echo "║  IMPORTANT: Update your .env file with this URL!      ║"
echo "╚════════════════════════════════════════════════════════╝"

# Update .env file automatically
sed -i.bak "s|NOWPAYMENTS_WEBHOOK_URL=.*|NOWPAYMENTS_WEBHOOK_URL=$NGROK_URL/api/v1/payments/webhook|" .env

echo "✅ .env file updated automatically"
echo "🔄 Please restart your backend server to apply changes"

# Keep script running
wait $NGROK_PID