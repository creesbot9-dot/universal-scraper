#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const {
  saveSession,
  loadSession,
  listSessions,
  isTokenExpired,
  needsRefresh,
  performLogin,
  getValidSession,
} = require('./auth-manager');

// Import site learner module
const {
  learn,
  save,
  recall,
  refresh,
  list: listSites,
  scrapeWithConfig,
  forget,
} = require('./site-learner');

const DEFAULT_WAIT = 2000;

// Load user agents
let userAgents = [];
try {
  const uaPath = path.join(__dirname, 'user-agents.json');
  if (fs.existsSync(uaPath)) {
    const uaData = JSON.parse(fs.readFileSync(uaPath, 'utf8'));
    userAgents = uaData.userAgents || [];
  }
} catch (e) {
  // Fallback to default
  userAgents = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'];
}

// Random delay helper
function randomDelay(min = 500, max = 2000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get random user agent
function getRandomUserAgent(customUa) {
  if (customUa) return customUa;
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Check if gog CLI is available
 */
function checkGogAvailable() {
  try {
    execSync('which gog', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Export data to Google Sheets
 * @param {Array} rows - Array of arrays to export
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Sheet tab name (default: "Sheet1")
 */
async function exportToSheets(rows, spreadsheetId, tabName = 'Sheet1') {
  if (!checkGogAvailable()) {
    throw new Error('gog CLI not available. Install with: npm install -g @openclaw/gog');
  }

  if (!spreadsheetId) {
    throw new Error('Invalid spreadsheet ID. Please provide a valid Google Sheets ID.');
  }

  const valuesJson = JSON.stringify(rows);
  
  // Escape the JSON for shell
  const escapedJson = valuesJson.replace(/'/g, "'\\''");

  const command = `gog sheets append "${spreadsheetId}" "${tabName}!A:Z" --values-json '${escapedJson}'`;

  try {
    execSync(command, { stdio: 'pipe' });
    console.error(`[export] Appended ${rows.length} rows to Google Sheets: ${spreadsheetId}`);
    return { success: true, rows: rows.length };
  } catch (err) {
    const errorMsg = err.stderr?.toString() || err.message;
    if (errorMsg.includes('404') || errorMsg.includes('not found')) {
      throw new Error(`Spreadsheet not found: ${spreadsheetId}. Check the ID and ensure you have access.`);
    }
    throw new Error(`Sheets export failed: ${errorMsg}`);
  }
}

/**
 * Export data to Google Docs
 * @param {string} content - Content to export (markdown/text)
 * @param {string} docName - Name for the new document
 */
async function exportToDoc(content, docName) {
  if (!checkGogAvailable()) {
    throw new Error('gog CLI not available. Install with: npm install -g @openclaw/gog');
  }

  if (!docName) {
    throw new Error('Document name is required. Use --doc <name>');
  }

  // Create the document
  const createCommand = `gog docs create "${docName}"`;
  
  try {
    execSync(createCommand, { stdio: 'pipe' });
    console.error(`[export] Created Google Doc: ${docName}`);
  } catch (err) {
    // Doc might already exist, that's ok
    const errorMsg = err.stderr?.toString() || err.message;
    if (!errorMsg.includes('already exists')) {
      console.error(`[export] Note: Could not create doc (may already exist): ${errorMsg}`);
    }
  }

  // Get current content using gog docs cat
  const catCommand = `gog docs cat "${docName}"`;
  let existingContent = '';
  
  try {
    const output = execSync(catCommand, { stdio: 'pipe' });
    existingContent = output.toString().trim();
  } catch {
    // Document might be empty or not accessible, continue
  }

  // Append new content (print to console as gog doesn't have direct append)
  const newContent = existingContent ? `${existingContent}\n\n---\n\n${content}` : content;
  
  // Since gog docs doesn't have append, we'll just print the formatted content
  // The user can copy it or we could write to a temp file
  console.error(`[export] Content for "${docName}":`);
  console.error('---');
  console.error(content);
  console.error('---');
  
  return { success: true, docName, note: 'Content printed - gog docs append not yet supported' };
}

/**
 * Flatten scraped data to rows for Sheets export
 * @param {Object} data - Scraped data object
 * @returns {Array} Array of arrays
 */
function flattenDataForSheets(data) {
  const rows = [];
  
  // Header row
  rows.push(['URL', 'Title', 'Type', 'Content']);
  
  // Main page info
  rows.push([data.url || '', data.title || '', 'page', 'Main page']);
  
  // Headings
  if (data.headings && data.headings.length > 0) {
    data.headings.forEach(h => {
      rows.push([data.url, data.title, 'heading', `[${h.level}] ${h.text}`]);
    });
  }
  
  // Links (limited to first 50 to avoid huge exports)
  if (data.links && data.links.length > 0) {
    data.links.slice(0, 50).forEach(link => {
      rows.push([data.url, data.title, 'link', `${link.text} (${link.href})`]);
    });
  }
  
  // Images (limited to first 20)
  if (data.images && data.images.length > 0) {
    data.images.slice(0, 20).forEach(img => {
      rows.push([data.url, data.title, 'image', `${img.alt || 'No alt'} (${img.src})`]);
    });
  }
  
  // Prices
  if (data.prices && data.prices.length > 0) {
    data.prices.forEach(price => {
      rows.push([data.url, data.title, 'price', price]);
    });
  }
  
  return rows;
}

/**
 * Format scraped data as markdown for Docs export
 * @param {Object} data - Scraped data object
 * @returns {string} Formatted markdown
 */
function formatDataAsMarkdown(data) {
  let md = '';
  
  // Title and URL
  md += `# ${data.title || 'Scraped Page'}\n\n`;
  md += `**URL:** ${data.url}\n\n`;
  md += `---\n\n`;
  
  // Headings
  if (data.headings && data.headings.length > 0) {
    md += `## Headings\n\n`;
    data.headings.forEach(h => {
      md += `- **[${h.level}]:** ${h.text}\n`;
    });
    md += `\n`;
  }
  
  // Links summary
  if (data.links && data.links.length > 0) {
    md += `## Links (${data.links.length} total, showing first 20)\n\n`;
    data.links.slice(0, 20).forEach(link => {
      md += `- [${link.text || link.href}](${link.href})\n`;
    });
    md += `\n`;
  }
  
  // Images summary
  if (data.images && data.images.length > 0) {
    md += `## Images (${data.images.length} total, showing first 10)\n\n`;
    data.images.slice(0, 10).forEach(img => {
      md += `- ${img.alt || 'No alt'}: ${img.src}\n`;
    });
    md += `\n`;
  }
  
  // Prices
  if (data.prices && data.prices.length > 0) {
    md += `## Prices Found\n\n`;
    data.prices.forEach(price => {
      md += `- ${price}\n`;
    });
    md += `\n`;
  }
  
  // Metadata
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    md += `## Metadata\n\n`;
    Object.entries(data.metadata).forEach(([key, value]) => {
      md += `- **${key}:** ${value}\n`;
    });
    md += `\n`;
  }
  
  // Text content preview
  if (data.text) {
    md += `## Text Content Preview\n\n`;
    md += data.text.substring(0, 2000);
    if (data.text.length > 2000) {
      md += `\n\n... (truncated, ${data.text.length} total characters)`;
    }
  }
  
  return md;
}

// Known tracking domains to block
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'doubleclick.net',
  'bing.com/bat.js',
  'analytics.twitter.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'newrelic.com',
  'sentry.io',
  'bugsnag.com',
  'intercom.io',
  'drift.com',
  'zendesk.com',
  'tiktok.com',
  'ads.tiktok.com',
  'connect.facebook.net',
];

/**
 * Detect if the current page is a 2FA/verification page
 * Looks for common 2FA form indicators
 */
async function detect2FAPage(page) {
  return await page.evaluate(() => {
    const results = {
      is2FAPage: false,
      hasCodeField: false,
      hasOTPField: false,
      hasVerificationField: false,
      codeInputSelectors: [],
      submitButtonText: '',
    };

    // Check for common 2FA/verification keywords in page text
    const pageText = document.body.innerText.toLowerCase();
    const pageHTML = document.body.innerHTML.toLowerCase();
    
    const twofaKeywords = ['two-factor', '2fa', '2fa', 'two factor', 'authentication', 'verification', 'verify', 'otp', 'one-time', 'onetime', 'security code', 'verification code'];
    const has2FAText = twofaKeywords.some(k => pageText.includes(k));
    
    // Check for code input fields (4-8 digit input, common for OTP)
    const inputs = document.querySelectorAll('input');
    const codeInputs = [];
    
    for (const input of inputs) {
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const type = input.type || 'text';
      const autocomplete = input.getAttribute('autocomplete') || '';
      const maxlength = input.getAttribute('maxlength') || '';
      
      // Look for code/OTP/verification fields
      const isCodeField = (
        name.includes('code') ||
        name.includes('otp') ||
        name.includes('verification') ||
        name.includes('verify') ||
        name.includes('token') ||
        name.includes('pin') ||
        id.includes('code') ||
        id.includes('otp') ||
        id.includes('verification') ||
        id.includes('token') ||
        placeholder.includes('code') ||
        placeholder.includes('otp') ||
        placeholder.includes('verification') ||
        placeholder.includes('digit') ||
        placeholder.includes('pin') ||
        autocomplete === 'one-time-code' ||
        autocomplete === 'otp' ||
        (maxlength >= 4 && maxlength <= 8 && type === 'text') ||
        (maxlength >= 4 && maxlength <= 8 && type === 'tel') ||
        type === 'tel' && name.includes('phone')
      );
      
      if (isCodeField && type !== 'hidden') {
        codeInputs.push({
          name: input.name,
          id: input.id,
          type: input.type,
          maxlength: maxlength,
          placeholder: input.placeholder,
        });
        results.hasCodeField = true;
      }
    }

    results.codeInputSelectors = codeInputs;
    results.hasOTPField = codeInputs.some(c => c.maxlength >= 4 && c.maxlength <= 8);
    results.hasVerificationField = codeInputs.some(c => 
      c.name?.toLowerCase().includes('verification') || 
      c.name?.toLowerCase().includes('verify') ||
      c.placeholder?.toLowerCase().includes('verification')
    );

    // Check for submit button
    const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      results.submitButtonText = submitBtn.textContent?.trim() || submitBtn.value || '';
    }

    // Determine if it's a 2FA page
    results.is2FAPage = (
      (results.hasCodeField && has2FAText) ||
      (results.hasCodeField && codeInputs.length === 1) ||
      (results.hasOTPField && has2FAText) ||
      (results.hasVerificationField)
    );

    return results;
  });
}

/**
 * Attempt to enter 2FA code and submit
 */
async function attempt2FA(page, code) {
  console.error('[scraper] 2FA page detected, entering code...');
  
  // Find code input field
  const codeSelectors = [
    'input[name="code"]',
    'input[name="otp"]',
    'input[name="token"]',
    'input[name="verificationCode"]',
    'input[name="verification_code"]',
    'input[name="verify_code"]',
    'input[name="2fa"]',
    'input[name="two_factor_code"]',
    'input[name="securityCode"]',
    'input[id="code"]',
    'input[id="otp"]',
    'input[id="token"]',
    'input[id="verificationCode"]',
    'input[placeholder*="code"]',
    'input[placeholder*="Code"]',
    'input[placeholder*="OTP"]',
    'input[placeholder*="verification"]',
    'input[autocomplete="one-time-code"]',
    'input[maxlength="6"]',
    'input[maxlength="7"]',
    'input[maxlength="8"]',
    'input[type="tel"][maxlength]',
  ];
  
  let codeField = null;
  for (const sel of codeSelectors) {
    const el = await page.$(sel);
    if (el) {
      codeField = el;
      console.error('[scraper] Found 2FA input field with selector:', sel);
      break;
    }
  }
  
  // Fallback: find any input that looks like a code field
  if (!codeField) {
    const inputs = await page.$$('input');
    for (const input of inputs) {
      const name = await input.getAttribute('name') || '';
      const id = await input.getAttribute('id') || '';
      const placeholder = await input.getAttribute('placeholder') || '';
      const maxlength = await input.getAttribute('maxlength') || '';
      const type = await input.getAttribute('type') || 'text';
      
      if ((maxlength >= 4 && maxlength <= 8 && type !== 'password') ||
          name.toLowerCase().includes('code') ||
          name.toLowerCase().includes('otp') ||
          name.toLowerCase().includes('token') ||
          placeholder.toLowerCase().includes('code') ||
          placeholder.toLowerCase().includes('otp')) {
        codeField = input;
        console.error('[scraper] Found 2FA input field by fallback search');
        break;
      }
    }
  }
  
  if (!codeField) {
    console.error('[scraper] Could not find 2FA code input field');
    return false;
  }
  
  // Enter the code
  await codeField.fill(code);
  await page.waitForTimeout(300);
  console.error('[scraper] Entered 2FA code');
  
  // Find and click submit button
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Verify")',
    'button:has-text("Submit")',
    'button:has-text("Confirm")',
    'button:has-text("Continue")',
    'button:has-text("Login")',
    'button:has-text("Sign")',
  ];
  
  let submitButton = null;
  for (const sel of submitSelectors) {
    const el = await page.$(sel);
    if (el) {
      submitButton = el;
      break;
    }
  }
  
  if (submitButton) {
    await submitButton.click();
    console.error('[scraper] Submitted 2FA code, waiting for verification...');
    await page.waitForTimeout(2000);
    return true;
  }
  
  // Try pressing Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  console.error('[scraper] Pressed Enter to submit 2FA code');
  
  return true;
}
/* Looks for common login form indicators
 */
async function detectLoginPage(page) {
  return await page.evaluate(() => {
    const results = {
      isLoginPage: false,
      hasPasswordField: false,
      hasUsernameField: false,
      hasLoginForm: false,
      loginButtonText: '',
      formAction: '',
      selectors: [],
    };

    // Check for password field
    const passwordFields = document.querySelectorAll('input[type="password"]');
    results.hasPasswordField = passwordFields.length > 0;

    // Check for username/email fields (common patterns)
    const usernameSelectors = [
      'input[type="email"]',
      'input[name*="user"]',
      'input[name*="email"]',
      'input[name*="login"]',
      'input[id*="user"]',
      'input[id*="email"]',
      'input[id*="login"]',
      'input[placeholder*="user"]',
      'input[placeholder*="email"]',
      'input[placeholder*="login"]',
    ];
    
    for (const sel of usernameSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results.hasUsernameField = true;
        results.selectors.push(sel);
        break;
      }
    }

    // Check for login forms
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const formHTML = form.innerHTML.toLowerCase();
      const hasPassword = form.querySelector('input[type="password"]');
      const hasSubmit = form.querySelector('button, input[type="submit"]');
      
      if (hasPassword && hasSubmit) {
        results.hasLoginForm = true;
        results.formAction = form.action || '';
        
        // Get button text
        const submitBtn = form.querySelector('button, input[type="submit"]');
        if (submitBtn) {
          results.loginButtonText = submitBtn.textContent?.trim() || submitBtn.value || '';
        }
        break;
      }
    }

    // Check for common login page indicators in text/URL
    const pageText = document.body.innerText.toLowerCase();
    const loginKeywords = ['sign in', 'login', 'log in', 'password', 'username', 'email', 'signin'];
    const url = window.location.href.toLowerCase();
    
    const loginUrlIndicators = url.includes('login') || url.includes('signin') || url.includes('auth');
    const loginTextIndicators = loginKeywords.filter(k => pageText.includes(k)).length >= 2;

    // Determine if it's a login page
    results.isLoginPage = (
      (results.hasPasswordField && results.hasUsernameField && results.hasLoginForm) ||
      (results.hasPasswordField && loginTextIndicators) ||
      (loginUrlIndicators && results.hasPasswordField)
    );

    return results;
  });
}

/**
 * Attempt to login to a page with provided credentials
 */
async function attemptLogin(page, loginInfo, credentials) {
  const { username, password } = credentials;
  
  console.error('[scraper] Attempting login...');
  
  // Find and fill username field
  const usernameSelectors = [
    'input[type="email"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[name="login"]',
    'input[id="username"]',
    'input[id="email"]',
    'input[id="login"]',
    'input[name="user"]',
    'input[id="user"]',
  ];
  
  let usernameField = null;
  for (const sel of usernameSelectors) {
    const el = await page.$(sel);
    if (el) {
      usernameField = el;
      break;
    }
  }
  
  if (usernameField) {
    await usernameField.fill(username);
    await page.waitForTimeout(300);
  } else {
    console.error('[scraper] Could not find username field');
    return false;
  }
  
  // Find and fill password field
  const passwordField = await page.$('input[type="password"]');
  if (passwordField) {
    await passwordField.fill(password);
    await page.waitForTimeout(300);
  } else {
    console.error('[scraper] Could not find password field');
    return false;
  }
  
  // Find and click submit button
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign")',
    'button:has-text("Login")',
    'button:has-text("Log")',
    'button:has-text("Submit")',
  ];
  
  let submitButton = null;
  for (const sel of submitSelectors) {
    const el = await page.$(sel);
    if (el) {
      submitButton = el;
      break;
    }
  }
  
  if (submitButton) {
    await submitButton.click();
    console.error('[scraper] Clicked submit button, waiting for response...');
    
    // Wait for navigation or URL change
    try {
      await page.waitForTimeout(2000);
      
      // Check if URL changed (successful login usually redirects)
      const currentUrl = page.url();
      console.error('[scraper] Post-login URL:', currentUrl);
      
      return true;
    } catch (e) {
      console.error('[scraper] Wait after login failed:', e.message);
    }
  } else {
    console.error('[scraper] Could not find submit button, trying form submit');
    // Try to submit the form directly
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.submit();
    });
    await page.waitForTimeout(2000);
  }
  
  return true;
}

/**
 * Apply stealth patches to page using addInitScript (Playwright equivalent)
 */
async function applyStealthPatches(page) {
  const stealthScript = `
    // Override webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });

    // Override plugins (make it look like a real browser)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
      configurable: true
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });

    // Override platform
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true
    });

    // Override hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true
    });

    // Override device memory
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true
    });

    // Add fake chrome object if missing
    if (!window.chrome) {
      window.chrome = { runtime: {} };
    }

    // WebGL vendor/renderer spoofing
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.apply(this, arguments);
    };
  `;
  
  await page.addInitScript(stealthScript);
}

async function extractData(page) {
  return await page.evaluate(() => {
    const results = {
      url: window.location.href,
      title: document.title,
      headings: [],
      links: [],
      images: [],
      prices: [],
      metadata: {},
    };

    // Extract headings
    const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    headingSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent.trim();
        if (text) {
          results.headings.push({ level: selector, text });
        }
      });
    });

    // Extract links
    document.querySelectorAll('a').forEach(el => {
      const href = el.href;
      const text = el.textContent.trim();
      if (href) {
        results.links.push({ href, text: text.substring(0, 200) });
      }
    });

    // Extract images
    document.querySelectorAll('img').forEach(el => {
      const src = el.src || el.dataset.src || '';
      const alt = el.alt || '';
      if (src) {
        results.images.push({ src, alt });
      }
    });

    // Extract prices (common patterns)
    const priceRegex = /[\$\€\£\¥]?\s*[\d,]+\.?\d*/g;
    const bodyText = document.body.innerText;
    const priceMatches = bodyText.match(priceRegex);
    if (priceMatches) {
      results.prices = [...new Set(priceMatches)].slice(0, 50);
    }

    // Extract metadata
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.name || meta.getAttribute('property') || '';
      const content = meta.content || '';
      if (name && content) {
        results.metadata[name] = content.substring(0, 500);
      }
    });

    // Extract main text content (first ~5000 chars)
    const scripts = document.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());
    results.text = document.body.innerText.substring(0, 5000);

    return results;
  });
}

async function extractSelector(page, selector) {
  return await page.evaluate((sel) => {
    const elements = document.querySelectorAll(sel);
    return Array.from(elements).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.innerText?.trim().substring(0, 500),
      html: el.innerHTML?.trim().substring(0, 1000),
      href: el.href || null,
      src: el.src || null,
    }));
  }, selector);
}

/**
 * Create browser context with stealth settings
 */
async function createStealthContext(options = {}) {
  const launchOptions = { 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ]
  };

  // Add proxy support if specified
  if (options.proxy) {
    launchOptions.proxy = {
      server: options.proxy,
      bypass: 'localhost,127.0.0.1'
    };
  }

  const browser = await chromium.launch(launchOptions);

  // Random viewport with slight offset (looks more human)
  const viewportWidth = 1920 + Math.floor(Math.random() * 100) - 50;
  const viewportHeight = 1080 + Math.floor(Math.random() * 100) - 50;

  const contextOptions = {
    viewport: { 
      width: viewportWidth, 
      height: viewportHeight 
    },
    userAgent: getRandomUserAgent(options.userAgent),
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['notifications'],
    ignoreHTTPSErrors: true,
  };

  // Add extra HTTP headers if stealth mode
  if (options.stealth) {
    contextOptions.extraHTTPHeaders = {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };
  }

  const context = await browser.newContext(contextOptions);

  // Block tracking domains
  if (options.stealth) {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      const isBlocked = BLOCKED_DOMAINS.some(domain => url.includes(domain));
      if (isBlocked) {
        await route.abort();
      } else {
        await route.continue();
      }
    });
  }

  return { browser, context };
}

/**
 * Create browser context with session cookies
 */
async function createAuthenticatedContext(session, options = {}) {
  const { browser, context } = await createStealthContext(options);
  
  // Apply stealth patches
  const page = await context.newPage();
  if (options.stealth) {
    await applyStealthPatches(page);
  }
  
  // Apply saved cookies if any
  if (session.cookies && session.cookies.length > 0) {
    await context.addCookies(session.cookies);
  }
  
  return { browser, context, page };
}

/**
 * Enhanced scrape with retry logic and better error handling for dynamic sites
 */
async function scrapeWithRetry(url, options = {}, retries = 2) {
  const { browser, context } = await createStealthContext({
    stealth: options.stealth,
    userAgent: options.userAgent,
    proxy: options.proxy,
  });
  
  const page = await context.newPage();
  
  // Apply stealth patches before any navigation
  if (options.stealth) {
    await applyStealthPatches(page);
  }
  
  // Add random delay before navigation (human-like)
  if (options.stealth) {
    await page.waitForTimeout(randomDelay(300, 800));
  }
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Wait before retry
      if (attempt > 0) {
        const retryDelay = Math.min(2000 * attempt, 8000);
        await page.waitForTimeout(retryDelay);
      }
      
      // Navigate with safer options for dynamic sites
      const navOptions = { 
        waitUntil: options.stealth ? 'domcontentloaded' : 'networkidle', 
        timeout: options.timeout || 30000
      };
      
      // For dynamic sites, try to avoid navigation errors
      if (options.stealth) {
        // Use a more forgiving approach
        navOptions.waitUntil = 'domcontentloaded';
      }
      
      await page.goto(url, navOptions);
      
      // Wait for network to settle in stealth mode
      if (options.stealth) {
        await page.waitForTimeout(randomDelay(500, 1500));
      }
      
      // Custom wait if specified (useful for dynamic content)
      if (options.wait) {
        await page.waitForTimeout(options.wait);
      }
      
      // Wait for a specific element if requested (helps with SPAs)
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
      }
      
      // Check for login page and handle if credentials provided
      if (!options.session) { // Only check if not using existing session
        const loginInfo = await detectLoginPage(page);
        
        if (loginInfo.isLoginPage) {
          console.error('[scraper] Login page detected!');
          console.error('[scraper]    Has password field:', loginInfo.hasPasswordField);
          console.error('[scraper]    Has username field:', loginInfo.hasUsernameField);
          console.error('[scraper]    Login button:', loginInfo.loginButtonText || '(not found)');
          
          // If credentials provided via options, try to login
          if (options.username && options.password) {
            console.error('[scraper] Attempting login with provided credentials...');
            const loginSuccess = await attemptLogin(page, loginInfo, {
              username: options.username,
              password: options.password,
            });
            
            if (loginSuccess) {
              console.error('[scraper] Login submitted! Checking for 2FA requirement...');
              // Give time for post-login content to load
              await page.waitForTimeout(1500);
              
              // Check if 2FA page after login
              const twofaInfo = await detect2FAPage(page);
              
              if (twofaInfo.is2FAPage) {
                console.error('[scraper] 2FA/verification page detected!');
                console.error('[scraper]    Has code field:', twofaInfo.hasCodeField);
                console.error('[scraper]    Submit button:', twofaInfo.submitButtonText || '(not found)');
                
                if (options.twoFactorCode) {
                  console.error('[scraper] Attempting 2FA verification with provided code...');
                  const twofaSuccess = await attempt2FA(page, options.twoFactorCode);
                  
                  if (twofaSuccess) {
                    console.error('[scraper] 2FA verification submitted! Waiting for page...');
                    await page.waitForTimeout(2000);
                    console.error('[scraper] 2FA verification complete, extracting page data...');
                  } else {
                    console.error('[scraper] 2FA submission may have failed');
                  }
                } else {
                  console.error('[scraper] 2FA code required but not provided.');
                  console.error('[scraper] Use --code <code> to provide the 2FA/verification code.');
                }
              } else {
                console.error('[scraper] Login successful! Extracting page data...');
              }
              
              // Give more time for post-login/2FA content to load
              await page.waitForTimeout(2000);
            } else {
              console.error('[scraper] Login may have failed, trying to extract anyway...');
            }
          } else {
            console.error('[scraper] Credentials not provided. Use --user <username> --pass <password> to login.');
          }
        }
      }
      
      let results;
      
      if (options.selector) {
        results = await extractSelector(page, options.selector);
      } else {
        results = await extractData(page);
      }
      
      // Add stealth metadata if enabled
      if (options.stealth) {
        results._stealth = {
          enabled: true,
          userAgent: page.context().options?.userAgent || options.userAgent,
        };
      }
      
      // Add session metadata if authenticated
      if (options.session) {
        results._session = {
          platform: options.session,
          authenticated: true,
        };
      }
      
      // Add login metadata if credentials were used
      if (options.username && options.password) {
        results._login = {
          attempted: true,
          username: options.username,
        };
      }
      
      if (options.screenshot) {
        await page.screenshot({ path: options.screenshot, fullPage: true });
        console.error('Screenshot saved to:', options.screenshot);
      }
      
      await browser.close();
      return results;
      
    } catch (err) {
      lastError = err;
      
      // Check for specific navigation/context errors
      const errorMsg = err.message || '';
      const isNavError = errorMsg.includes('Execution context was destroyed') ||
                         errorMsg.includes('Navigation failed') ||
                         errorMsg.includes('net::ERR_') ||
                         errorMsg.includes('Timeout') ||
                         errorMsg.includes('redirect');
      
      if (!isNavError || attempt >= retries) {
        await browser.close();
        throw err;
      }
      
      // Retry on navigation errors
      console.error(`[scraper] Navigation issue (attempt ${attempt + 1}/${retries + 1}), retrying...`);
    }
  }
  
  await browser.close();
  throw lastError;
}

/**
 * Legacy scrape function - now wraps scrapeWithRetry
 */
async function scrape(url, options = {}) {
  return scrapeWithRetry(url, options, options.retries || 2);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle auth commands first
  if (args.includes('--login')) {
    const loginIndex = args.indexOf('--login');
    const platformIndex = args.indexOf('--platform');
    const userIndex = args.indexOf('--user');
    const passIndex = args.indexOf('--pass');
    
    if (platformIndex === -1 || userIndex === -1 || passIndex === -1) {
      console.error('Usage: node scraper.js --login --platform <name> --user <username> --pass <password>');
      process.exit(1);
    }
    
    const platform = args[platformIndex + 1];
    const user = args[userIndex + 1];
    const pass = args[passIndex + 1];
    
    try {
      await performLogin(platform, { user, pass });
      console.log(JSON.stringify({ success: true, platform }));
    } catch (err) {
      console.error('Login error:', err.message);
      process.exit(1);
    }
    return;
  }
  
  // Handle session list command
  if (args.includes('--sessions')) {
    const sessions = listSessions();
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  
  // Handle site learner commands
  if (args.includes('--learn')) {
    const learnIndex = args.indexOf('--learn');
    const siteName = args[learnIndex + 1];
    const urlIndex = args.indexOf('--url');
    const targetUrl = urlIndex !== -1 ? args[urlIndex + 1] : args[0];
    
    if (!siteName) {
      console.error('Usage: node scraper.js <url> --learn <name>');
      process.exit(1);
    }
    
    if (!targetUrl || !targetUrl.startsWith('http')) {
      console.error('Error: Please provide a valid URL to learn');
      process.exit(1);
    }
    
    try {
      console.error(`[scraper] Learning site: ${siteName} from ${targetUrl}`);
      const config = await learn(targetUrl);
      save(siteName, config);
      console.log(JSON.stringify({ success: true, name: siteName, domain: config.domain }));
    } catch (err) {
      console.error('Learn error:', err.message);
      process.exit(1);
    }
    return;
  }
  
  if (args.includes('--use')) {
    const useIndex = args.indexOf('--use');
    const siteName = args[useIndex + 1];
    
    if (!siteName) {
      console.error('Usage: node scraper.js --use <name> [url]');
      process.exit(1);
    }
    
    const config = recall(siteName);
    if (!config) {
      console.error(`Error: Site "${siteName}" not found. Learn it first with --learn ${siteName}`);
      process.exit(1);
    }
    
    // Use URL from args if provided, otherwise use learned URL
    const urlIndex = args.indexOf('--url');
    const targetUrl = urlIndex !== -1 ? args[urlIndex + 1] : config.url;
    
    try {
      console.error(`[scraper] Using learned config for: ${siteName}`);
      const data = await scrapeWithConfig(targetUrl, config);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Scrape error:', err.message);
      process.exit(1);
    }
    return;
  }
  
  if (args.includes('--learned')) {
    const sites = listSites();
    if (sites.length === 0) {
      console.log(JSON.stringify({ message: 'No learned sites yet. Use --learn <name> to learn a site.' }));
    } else {
      console.log(JSON.stringify(sites, null, 2));
    }
    return;
  }
  
  if (args.includes('--refresh')) {
    const refreshIndex = args.indexOf('--refresh');
    const siteName = args[refreshIndex + 1];
    
    if (!siteName) {
      console.error('Usage: node scraper.js --refresh <name>');
      process.exit(1);
    }
    
    try {
      console.error(`[scraper] Refreshing site: ${siteName}`);
      const config = await refresh(siteName);
      console.log(JSON.stringify({ success: true, name: siteName, domain: config.domain }));
    } catch (err) {
      console.error('Refresh error:', err.message);
      process.exit(1);
    }
    return;
  }
  
  if (args.includes('--forget')) {
    const forgetIndex = args.indexOf('--forget');
    const siteName = args[forgetIndex + 1];
    
    if (!siteName) {
      console.error('Usage: node scraper.js --forget <name>');
      process.exit(1);
    }
    
    const deleted = forget(siteName);
    if (deleted) {
      console.log(JSON.stringify({ success: true, name: siteName }));
    } else {
      console.error(`Error: Site "${siteName}" not found`);
      process.exit(1);
    }
    return;
  }
  
  // Regular scrape mode
  if (args.length === 0) {
    console.error('Usage: node scraper.js <url> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --wait <ms>          Wait before extracting (default: 2000)');
    console.error('  --wait-for <selector> Wait for element to appear (helps dynamic sites)');
    console.error('  --selector <css>     Extract only matching CSS selector');
    console.error('  --json               Output raw JSON');
    console.error('  --screenshot         Save screenshot to screenshot.png');
    console.error('  --retries <n>        Number of retries on failure (default: 2)');
    console.error('  --timeout <ms>       Page load timeout (default: 30000)');
    console.error('');
    console.error('Export Options:');
    console.error('  --sheets <id>        Export data to Google Sheets (provide spreadsheet ID)');
    console.error('  --sheets-tab <name>  Sheet tab name (default: "Sheet1")');
    console.error('  --doc <name>         Export data to a Google Doc');
    console.error('');
    console.error('Stealth Options:');
    console.error('  --stealth            Enable stealth mode (avoids bot detection)');
    console.error('  --user-agent         Specify custom user agent');
    console.error('  --proxy <url>        Use proxy server (e.g., http://proxy:port)');
    console.error('');
    console.error('Authentication:');
    console.error('  --login --platform <name> --user <user> --pass <pass>  Login and save session');
    console.error('  --session <name>     Use saved session for authentication');
    console.error('  --auto-refresh       Auto-refresh expired tokens');
    console.error('  --sessions           List all saved sessions');
    console.error('');
    console.error('Login Prompt (for pages requiring auth):');
    console.error('  --user <username>    Username for login prompt');
    console.error('  --pass <password>   Password for login prompt');
    console.error('  --code <code>        2FA/verification code (if login triggers 2FA)');
    console.error('');
    console.error('Site Learning:');
    console.error('  <url> --learn <name>    Learn a site and save its configuration');
    console.error('  --use <name>            Use a learned site config to scrape');
    console.error('  --learned               List all learned sites');
    console.error('  --refresh <name>        Refresh/re-analyze a learned site');
    console.error('  --forget <name>         Delete a learned site config');
    process.exit(1);
  }
  
  const url = args[0];
  const options = {
    wait: DEFAULT_WAIT,
    json: false,
    screenshot: false,
    session: null,
    autoRefresh: false,
    stealth: false,
    userAgent: null,
    proxy: null,
    sheets: null,
    sheetsTab: 'Sheet1',
    doc: null,
    retries: 2,
    timeout: 30000,
    waitForSelector: null,
    username: null,
    password: null,
    twoFactorCode: null,
  };
  
  // Parse flags
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--wait' && args[i + 1]) {
      options.wait = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--selector' && args[i + 1]) {
      options.selector = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--screenshot') {
      options.screenshot = 'screenshot.png';
    } else if (args[i] === '--session' && args[i + 1]) {
      options.session = args[i + 1];
      i++;
    } else if (args[i] === '--auto-refresh') {
      options.autoRefresh = true;
    } else if (args[i] === '--stealth') {
      options.stealth = true;
    } else if (args[i] === '--user-agent' && args[i + 1]) {
      options.userAgent = args[i + 1];
      i++;
    } else if (args[i] === '--proxy' && args[i + 1]) {
      options.proxy = args[i + 1];
      i++;
    } else if (args[i] === '--sheets' && args[i + 1]) {
      options.sheets = args[i + 1];
      i++;
    } else if (args[i] === '--sheets-tab' && args[i + 1]) {
      options.sheetsTab = args[i + 1];
      i++;
    } else if (args[i] === '--doc' && args[i + 1]) {
      options.doc = args[i + 1];
      i++;
    } else if (args[i] === '--retries' && args[i + 1]) {
      options.retries = parseInt(args[i + 1], 10) || 2;
      i++;
    } else if (args[i] === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[i + 1], 10) || 30000;
      i++;
    } else if (args[i] === '--wait-for' && args[i + 1]) {
      options.waitForSelector = args[i + 1];
      i++;
    } else if (args[i] === '--user' && args[i + 1]) {
      options.username = args[i + 1];
      i++;
    } else if (args[i] === '--pass' && args[i + 1]) {
      options.password = args[i + 1];
      i++;
    } else if (args[i] === '--code' && args[i + 1]) {
      options.twoFactorCode = args[i + 1];
      i++;
    }
  }
  
  try {
    const data = await scrape(url, options);
    
    // Handle exports
    if (options.sheets) {
      const rows = flattenDataForSheets(data);
      await exportToSheets(rows, options.sheets, options.sheetsTab);
    }
    
    if (options.doc) {
      const markdown = formatDataAsMarkdown(data);
      await exportToDoc(markdown, options.doc);
    }
    
    // Output JSON (always, or based on json flag)
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    const errorMsg = err.message || '';
    
    // Provide helpful error messages for common dynamic site issues
    let hint = '';
    if (errorMsg.includes('Execution context was destroyed') || 
        errorMsg.includes('Navigation failed') ||
        errorMsg.includes('redirect')) {
      hint = '\n\n💡 Try adding --wait 3000 or --stealth for dynamic sites.';
    } else if (errorMsg.includes('Timeout')) {
      hint = '\n\n💡 Try increasing timeout with --timeout 60000 or add --wait-for <selector>.';
    } else if (errorMsg.includes('net::ERR_')) {
      hint = '\n\n💡 The site might be blocking requests. Try --stealth.';
    }
    
    console.error('Scraper error:' + (hint ? hint : ` ${errorMsg}`));
    process.exit(1);
  }
}

main();
