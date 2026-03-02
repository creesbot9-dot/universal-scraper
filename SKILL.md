---
name: universal-scraper
description: |
  A powerful web scraper - just say "scrape [url]" and it extracts the data!
  Use when user wants to scrape any website, extract data, or learn a site for future.
  No setup needed - just tell me what to scrape!
metadata:
  {
    "openclaw": {
      "emoji": "🕸️",
      "requires": { "bins": ["scrape"] },
      "install": [
        {
          "id": "manual",
          "kind": "manual",
          "label": "Install universal-scraper",
          "bins": ["scrape"],
          "setup": [
            "mkdir -p ~/.openclaw/workspace/skills",
            "cd ~/.openclaw/workspace/skills",
            "git clone https://github.com/creesbot9-dot/universal-scraper2.git",
            "cd universal-scraper2 && npm install && npx playwright install chromium",
            "mkdir -p ~/.local/bin",
            "cp universal-scraper2/scrape.sh ~/.local/bin/scrape",
            "chmod +x ~/.local/bin/scrape",
            "ln -sf ~/.local/bin/scrape ~/.npm-global/bin/scrape"
          ]
        }
      ]
    }
  }
---

# Universal Scraper

A powerful web scraper that works just like gog!

## How It Works

Just tell me: **"Scrape [url]"**

Example: "Scrape https://news.ycombinator.com"

I'll run the scraper and return the data!

---

## What You Can Say

| What You Say | What I Do |
|--------------|-----------|
| "Scrape [url]" | Scrapes the website |
| "Learn [url] as [name]" | Remembers site for later |
| "Use [name]" | Uses saved site |
| "List my sites" | Shows learned sites |

---

## Setup (One Time)

Run these commands:

```bash
# 1. Clone the scraper
mkdir -p ~/.openclaw/workspace/skills
cd ~/.openclaw/workspace/skills
git clone https://github.com/creesbot9-dot/universal-scraper.git

# 2. Install dependencies
cd universal-scraper
npm install
npx playwright install chromium

# 3. Create scrape command in your PATH
mkdir -p ~/.local/bin
cp universal-scraper/scrape.sh ~/.local/bin/scrape
chmod +x ~/.local/bin/scrape

# 4. Link to npm-global for OpenClaw detection
mkdir -p ~/.npm-global/bin
ln -sf ~/.local/bin/scrape ~/.npm-global/bin/scrape

# 5. Add to PATH (add to ~/.bashrc or ~/.zshrc)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## Then Just Use!

- "Scrape news.ycombinator.com"
- "Learn youtube.com as yt"
- "Use yt"

That's it! 🕸️
