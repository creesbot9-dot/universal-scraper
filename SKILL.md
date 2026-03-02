---
name: universal-scraper
description: |
  A powerful web scraper - just say "scrape [url]" and it extracts the data!
  Use when user wants to scrape any website, extract data, or learn a site for future.
  IMPORTANT: User MUST provide a specific URL. If user gives vague request like 
  "top videos" or "trending news" without URL, ask for the URL first - do NOT 
  try to use web_search or other tools. Just ask: "Please provide the URL you want to scrape."
  
  ERROR HANDLING: If scraping fails, tell the user what happened simply. Do NOT suggest 
  other skills. Offer retry options like adding --wait, --stealth, or --retries.
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

---

## Handling Failures

If scraping fails, tell the user **what happened simply** - don't be vague or technical. Then offer retry options.

### Common Errors & What to Say

**"Execution context destroyed" / "Navigation failed" / Redirect errors:**
> "The page redirected during loading and the scraper lost track of it. This often happens with dynamic sites.
> 
> Want me to retry with:
> - `--wait 3000` (wait 3 seconds for content to load)
> - `--stealth` (more human-like behavior)
> - `--retries 3` (try up to 3 times)"

**"Timeout" errors:**
> "The page took too long to load.
> 
> Options:
> - `--timeout 60000` (wait up to 60 seconds)
> - `--wait 5000` (extra wait after page loads)
> - `--wait-for #content` (wait for a specific element)"

**"net::ERR_" / Connection errors:**
> "Couldn't reach the page - the site might be blocking bots or is down.
> 
> Try:
> - `--stealth` (avoids bot detection)
> - `--user-agent "Mozilla/5.0..."` (custom user agent)"

### What NOT to Do
- ❌ Don't suggest other skills (like "rentvine-scraper")
- ❌ Don't say "try a different tool"
- ❌ Don't be vague ("something went wrong")

---

## How It Works

Just tell me: **"Scrape [url]"**

Example: "Scrape https://news.ycombinator.com"

---

## What You Can Say

| What You Say | What I Do |
|--------------|-----------|
| "Scrape [url]" | Scrapes the website |
| "Scrape [url] with --stealth" | Scrapes with bot detection avoidance |
| "Scrape [url] --wait 3000" | Waits 3 seconds before extracting |
| "Scrape [url] --retries 3" | Retry up to 3 times on failure |
| "Scrape [url] --wait-for #main" | Wait for element #main to appear |
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
