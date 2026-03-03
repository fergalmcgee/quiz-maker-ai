#!/bin/bash

# Source user profiles to ensure node/npm paths (like NVM or Homebrew) are loaded
if [ -f ~/.nvm/nvm.sh ]; then
    source ~/.nvm/nvm.sh
elif [ -f ~/.bash_profile ]; then
    source ~/.bash_profile
elif [ -f ~/.zshrc ]; then
    source ~/.zshrc
fi

# Also add common installation paths just in case
export PATH=$PATH:/usr/local/bin:/usr/local/sbin:/opt/local/bin:/opt/local/sbin:/opt/homebrew/bin:/opt/homebrew/sbin

# Set the directory to where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "      Starting QuizMaker (Mac)          "
echo "========================================"

# Cleanup function to kill the backend server when this script exits
cleanup() {
    echo ""
    echo "Stopping QuizMaker servers..."
    kill $SERVER_PID 2>/dev/null
    exit
}
trap cleanup EXIT INT TERM

# Start Backend Server
echo "-> Starting Backend Server..."
cd "$DIR/server"
if [ ! -d "node_modules" ]; then
    echo "   Installing server dependencies..."
    npm install
fi
npm run dev &
SERVER_PID=$!

# Start Frontend Client
echo "-> Starting Frontend Client..."
cd "$DIR/client"
if [ ! -d "node_modules" ]; then
    echo "   Installing client dependencies..."
    npm install
fi

echo "========================================"
echo "   QuizMaker is starting up!"
echo "   Press Ctrl+C to stop both servers."
echo "========================================"

npm run dev
