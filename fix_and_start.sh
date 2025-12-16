#!/bin/bash
echo "=== 🛠️ AUTO-FIXING YOUR PROJECT 🛠️ ==="
echo "1. Installing missing tools (this takes a minute)..."
npm install

echo "2. Verifying everything is correct..."
npm run check

echo "3. Starting the System..."
echo "✅ READY! You can now use the Chat Bot."
npm run dev
