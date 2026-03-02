# Universal Web Scraper Skill

A flexible web scraper that handles both static and JavaScript-heavy websites using Playwright.

## Installation

```bash
cd /home/creesler/.openclaw/workspace/skills/universal-scraper
npm init -y
npm install playwright
npx playwright install chromium
```

## Usage

### Basic URL Scraping

```bash
node scraper.js <url>
```

Examples:
```bash
node scraper.js https://old.reddit.com/r/programming
node scraper.js https://craigslist.org
node scraper.js https://boards.4chan.org/tech/
```

### Extract Specific Data

The scraper extracts:
- **title** - Page title
- **url** - Current URL
- **headings** - All h1-h6 headings with text
- **links** - All links with href and text
- **text** - Main body text content
- **images** - Image URLs
- **prices** - Detected price patterns ($, €, £, etc.)
- **metadata** - Meta description, keywords, og: tags

### Custom Extraction

Edit `scraper.js` and modify the `extractData` function to add custom selectors:

```javascript
async function extractData(page, customSelectors) {
  const data = await page.evaluate(() => {
    // Add custom extraction logic here
    return {
      // Your custom fields
    };
  });
  return data;
}
```

## JavaScript-Heavy Sites

The scraper automatically waits for network idle and can handle:
- Single-page applications (SPAs)
- Lazy-loaded content
- Infinite scroll (requires custom logic)
- Authentication-required pages (requires session cookies)

### Waiting for Dynamic Content

```javascript
// Wait for specific element
await page.waitForSelector('.dynamic-content');

// Wait for network idle
await page.waitForLoadState('networkidle');
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--wait <ms>` | Wait milliseconds before extracting |
| `--selector <css>` | Extract only elements matching CSS selector |
| `--json` | Output raw JSON (no formatting) |
| `--screenshot` | Save screenshot to file |

## Examples

```bash
# Scrape with custom wait time
node scraper.js https://example.com --wait 3000

# Extract only specific elements
node scraper.js https://example.com --selector ".product-title"

# Output raw JSON
node scraper.js https://example.com --json
```

## Notes

- Some sites may block scraping; respect robots.txt and rate limits
- For authenticated sites, pass cookies via `scraper.js` customization
- Use `--screenshot` to debug visually
