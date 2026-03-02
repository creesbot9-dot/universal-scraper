---
name: universal-scraper
description: |
  A powerful web scraper - just say "scrape [url]" and it extracts the data!
  Use when user wants to scrape any website, extract data, or learn a site for future.
  IMPORTANT: User MUST provide a specific URL. If user gives vague request like 
  "top videos" or "trending news" without URL, ask for the URL first - do NOT 
  try to use web_search or other tools. Just ask: "Please provide the URL you want to scrape."
metadata:
  {
    "openclaw": {
      "emoji": "🕸️",
      "requires": { "bins": ["scrape"] }
    }
  }
---

# Universal Scraper

A powerful web scraper that works just like gog!

## IMPORTANT - URL Required

The scraper needs a **specific URL**. If user doesn't provide one, **ASK for it**.

✅ Good: "Scrape https://news.ycombinator.com"
✅ Good: "Scrape youtube.com/feed/trending"  
❌ Bad: "Scrape top news" (no URL - ask for URL!)
❌ Bad: "Find trending videos and scrape them" (need URL first)

## How It Works

Just tell me: **"Scrape [url]"**

Example: "Scrape https://news.ycombinator.com"

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

```bash
curl -sL https://raw.githubusercontent.com/creesbot9-dot/universal-scraper/master/install.sh | bash
```

---

That's it! 🕸️
