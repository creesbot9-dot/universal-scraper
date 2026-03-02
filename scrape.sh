#!/bin/bash
# Universal Scraper CLI Wrapper
# Place this in your PATH to use as: scrape <url> [options]

SCRAPER_DIR="$HOME/.openclaw/workspace/skills/universal-scraper"

cd "$SCRAPER_DIR" || exit 1

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run the scraper
node scraper.js "$@"
