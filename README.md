# Universal Scraper 🕸️

A powerful web scraper that handles both static and JavaScript-heavy websites using Playwright.

## Features

- 🌐 Scrape static and dynamic web pages
- 🔐 Built-in authentication manager
- 🧠 Site learning capability
- 📸 Screenshot capture
- 🚫 User-agent rotation
- 💾 Session management

## Installation

### Quick Install (Linux/macOS)

```bash
curl -sL https://raw.githubusercontent.com/creesbot9-dot/universal-scraper/main/install.sh | bash
```

This will:
- Download and install the scraper to `~/.local/share/universal-scraper`
- Install Node.js dependencies and Playwright browser
- Create the `scrape` command in `~/.local/bin`
- Add `~/.local/bin` to your PATH

### Manual Installation

```bash
git clone https://github.com/creesbot9-dot/universal-scraper.git
cd universal-scraper
npm install
npx playwright install chromium
```

## Usage

```bash
# Basic usage
scrape <url>

# With options
scrape https://example.com --help

# Using Node directly
node scraper.js <url>
```

## Options

| Option | Description |
|--------|-------------|
| `--help` | Show help message |
| `--output` | Output file path |
| `--screenshot` | Take a screenshot |
| `--wait` | Wait time in milliseconds |

## Requirements

- Node.js 18+
- npm
- Git
- Chromium (installed via Playwright)

## License

MIT
