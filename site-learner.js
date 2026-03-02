/**
 * Site Learning Module
 * Analyzes sites and remembers their configuration for future use
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LEARNED_SITES_DIR = path.join(__dirname, 'learned-sites');

// Ensure learned-sites directory exists
function ensureDir() {
  if (!fs.existsSync(LEARNED_SITES_DIR)) {
    fs.mkdirSync(LEARNED_SITES_DIR, { recursive: true });
  }
}

/**
 * Analyze a site and learn its structure
 * @param {string} url - URL to analyze
 * @param {Object} options - Options for analysis
 * @returns {Object} Learned site configuration
 */
async function learn(url, options = {}) {
  ensureDir();
  
  const config = {
    url,
    learnedAt: new Date().toISOString(),
    selectors: {},
    patterns: {},
    auth: { required: false },
    apiEndpoints: [],
    pagination: null,
    notes: [],
  };
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // Track requests to find API endpoints
    const apiRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      // Detect API-like requests
      if (url.includes('/api/') || url.includes('/graphql') || url.endsWith('.json')) {
        apiRequests.push({
          url,
          method: request.method(),
          resourceType: request.resourceType()
        });
      }
    });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Analyze selectors
    config.selectors = await analyzeSelectors(page);
    
    // Check for login/auth requirements
    config.auth = await analyzeAuth(page);
    
    // Detect pagination patterns
    config.pagination = await detectPagination(page);
    
    // Store API endpoints discovered
    config.apiEndpoints = apiRequests.slice(0, 20); // Limit to 20
    
    // Analyze common patterns
    config.patterns = await analyzePatterns(page);
    
    // Add URL metadata
    const urlObj = new URL(url);
    config.domain = urlObj.hostname;
    config.protocol = urlObj.protocol;
    
    console.error(`[site-learner] Learned ${config.domain}`);
    console.error(`[site-learner] Found ${Object.keys(config.selectors).length} selector groups`);
    console.error(`[site-learner] Auth required: ${config.auth.required}`);
    
    return config;
    
  } finally {
    await browser.close();
  }
}

/**
 * Analyze and extract common selectors from a page
 */
async function analyzeSelectors(page) {
  return await page.evaluate(() => {
    const selectors = {
      titles: [],
      links: [],
      images: [],
      prices: [],
      containers: [],
    };
    
    // Find title selectors
    const titles = [
      'h1', 'h1 a', '.title', '.post-title', '.article-title', 
      '[class*="title"]', '[class*="heading"]'
    ];
    for (const sel of titles) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        selectors.titles.push(sel);
        break;
      }
    }
    
    // Find link containers
    const linkContainers = [
      'a[href]', '[class*="link"]', '[class*="post"]', 'article', 
      '[class*="item"]', '[class*="entry"]'
    ];
    for (const sel of linkContainers) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0 && els.length < 100) {
        selectors.links.push(sel);
      }
    }
    
    // Find image containers
    const imageContainers = [
      'img', '[class*="image"]', '[class*="img"]', '[class*="photo"]', 
      '[class*="thumbnail"]', '[class*="picture"]'
    ];
    for (const sel of imageContainers) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        selectors.images.push(sel);
        break;
      }
    }
    
    // Find price elements
    const priceSelectors = [
      '[class*="price"]', '[class*="cost"]', '[class*="amount"]', 
      '[class*="value"]', '[data-price]'
    ];
    for (const sel of priceSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        selectors.prices.push(sel);
        break;
      }
    }
    
    // Find content containers
    const containerSelectors = [
      'main', 'article', '[class*="content"]', '[class*="main"]', 
      '[class*="body"]', '[role="main"]'
    ];
    for (const sel of containerSelectors) {
      const els = document.querySelector(sel);
      if (els) {
        selectors.containers.push(sel);
        break;
      }
    }
    
    return selectors;
  });
}

/**
 * Analyze if the site requires authentication
 */
async function analyzeAuth(page) {
  return await page.evaluate(() => {
    const authIndicators = {
      required: false,
      methods: [],
      loginUrl: null,
      selectors: [],
    };
    
    // Check for login forms
    const loginForms = document.querySelectorAll('form[type="login"], form[action*="login"], form[action*="signin"]');
    const loginButtons = document.querySelectorAll('button[type="login"], a[href*="login"], a[href*="signin"], a[href*="auth"]');
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    
    if (loginForms.length > 0 || passwordInputs.length > 0) {
      authIndicators.required = true;
      authIndicators.methods.push('form');
      authIndicators.selectors.push('form[type="login"]', 'input[type="password"]');
    }
    
    if (loginButtons.length > 0) {
      authIndicators.methods.push('button/link');
      const loginLink = document.querySelector('a[href*="login"], a[href*="signin"]');
      if (loginLink) {
        authIndicators.loginUrl = loginLink.href;
      }
    }
    
    // Check for auth-related cookies or localStorage
    const cookies = document.cookie;
    if (cookies.includes('session') || cookies.includes('token') || cookies.includes('auth')) {
      authIndicators.methods.push('cookie');
    }
    
    return authIndicators;
  });
}

/**
 * Detect pagination patterns on the page
 */
async function detectPagination(page) {
  return await page.evaluate(() => {
    const pagination = {
      type: null,
      selectors: [],
      nextButton: null,
      pageParam: null,
    };
    
    // Common pagination selectors
    const pageLinks = document.querySelectorAll('a[href*="page"], a[href*="p="], a[href*="/page/"], .pagination a, [class*="pagination"] a, [class*="pager"] a');
    
    if (pageLinks.length > 0) {
      pagination.type = 'link';
      pagination.selectors = [
        'a[href*="page"]', 
        '.pagination a', 
        '[class*="pagination"] a'
      ];
      
      // Find the "next" button
      const nextBtn = document.querySelector('a[class*="next"], a[rel="next"], button[class*="next"]');
      if (nextBtn) {
        pagination.nextButton = nextBtn.tagName.toLowerCase() + (nextBtn.className ? '.' + nextBtn.className : '');
      }
    }
    
    // Check for "load more" buttons
    const loadMore = document.querySelector('button[class*="more"], a[class*="more"], [class*="load-more"]');
    if (loadMore) {
      pagination.type = pagination.type ? 'both' : 'load_more';
      pagination.selectors.push('[class*="load-more"]');
      pagination.loadMoreButton = loadMore.tagName.toLowerCase() + (loadMore.className ? '.' + loadMore.className : '');
    }
    
    // Detect URL-based pagination
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.href;
      if (href.includes('page=') || href.includes('/page/') || href.includes('?p=')) {
        pagination.type = pagination.type || 'url';
        // Extract page parameter
        const urlMatch = href.match(/[?&](page|p)=\d+/);
        if (urlMatch) {
          pagination.pageParam = urlMatch[0].replace(/\d+/, '{page}');
        }
        break;
      }
    }
    
    return pagination;
  });
}

/**
 * Analyze common patterns on the page
 */
async function analyzePatterns(page) {
  return await page.evaluate(() => {
    const patterns = {
      infiniteScroll: false,
      lazyLoad: false,
      modalContent: false,
      iframeContent: false,
      spa: false,
      jsonLd: [],
    };
    
    // Check for infinite scroll
    if (window.onscroll || document.querySelector('[class*="infinite"]')) {
      patterns.infiniteScroll = true;
    }
    
    // Check for lazy loading (images with data-src)
    const lazyImages = document.querySelectorAll('img[data-src], img[lazy]');
    if (lazyImages.length > 0) {
      patterns.lazyLoad = true;
    }
    
    // Check for modals
    const modals = document.querySelectorAll('[class*="modal"], [class*="popup"], [role="dialog"]');
    if (modals.length > 0) {
      patterns.modalContent = true;
    }
    
    // Check for iframes
    const iframes = document.querySelectorAll('iframe');
    if (iframes.length > 0) {
      patterns.iframeContent = true;
      patterns.iframeSelectors = Array.from(iframes).map(iframe => iframe.src).filter(Boolean);
    }
    
    // Check if it's likely an SPA (React, Vue, Angular indicators)
    const root = document.querySelector('#root, #app, [data-reactroot], [data-vue-app]');
    if (root) {
      patterns.spa = true;
      patterns.spaRoot = root.id || root.className;
    }
    
    // Extract JSON-LD data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        patterns.jsonLd.push(data);
      } catch (e) {}
    });
    
    return patterns;
  });
}

/**
 * Save a learned site configuration
 * @param {string} name - Name for the site
 * @param {Object} config - Site configuration to save
 */
function save(name, config) {
  ensureDir();
  const filePath = path.join(LEARNED_SITES_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  console.error(`[site-learner] Saved configuration for "${name}"`);
  return filePath;
}

/**
 * Load a learned site configuration
 * @param {string} name - Name of the site to recall
 * @returns {Object|null} Site configuration or null if not found
 */
function recall(name) {
  const filePath = path.join(LEARNED_SITES_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Refresh a learned site (re-analyze and update)
 * @param {string} name - Name of the site to refresh
 * @param {Object} options - Options for re-analysis
 * @returns {Object} Updated configuration
 */
async function refresh(name, options = {}) {
  const existing = recall(name);
  if (!existing) {
    throw new Error(`Site "${name}" not found. Learn it first with --learn ${name}`);
  }
  
  const newConfig = await learn(existing.url, options);
  newConfig.originalName = name;
  newConfig.previousLearnedAt = existing.learnedAt;
  
  save(name, newConfig);
  console.error(`[site-learner] Refreshed configuration for "${name}"`);
  
  return newConfig;
}

/**
 * List all learned sites
 * @returns {Array} Array of learned site info
 */
function list() {
  ensureDir();
  const files = fs.readdirSync(LEARNED_SITES_DIR).filter(f => f.endsWith('.json'));
  
  return files.map(file => {
    const name = file.replace('.json', '');
    const config = recall(name);
    return {
      name,
      domain: config?.domain || 'unknown',
      url: config?.url || '',
      learnedAt: config?.learnedAt || 'unknown',
      authRequired: config?.auth?.required || false,
    };
  });
}

/**
 * Scrape using a learned configuration
 * @param {string} url - URL to scrape
 * @param {Object} config - Learned site configuration
 * @param {Object} options - Additional scrape options
 * @returns {Object} Scraped data
 */
async function scrapeWithConfig(url, config, options = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    const data = {
      url: page.url(),
      title: await page.title(),
      config: config.selectors,
    };
    
    // Extract content based on learned selectors
    if (config.selectors.titles?.length) {
      const titles = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).map(el => el.innerText.trim()).filter(Boolean);
      }, config.selectors.titles[0]);
      data.titles = titles.slice(0, 20);
    }
    
    if (config.selectors.links?.length) {
      const links = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .filter(el => el.href)
          .map(el => ({ href: el.href, text: el.innerText.trim().substring(0, 100) }))
          .slice(0, 50);
      }, config.selectors.links[0]);
      data.links = links;
    }
    
    if (config.selectors.images?.length) {
      const images = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .map(el => ({ src: el.src || el.dataset?.src, alt: el.alt }))
          .filter(img => img.src)
          .slice(0, 30);
      }, config.selectors.images[0]);
      data.images = images;
    }
    
    if (config.selectors.prices?.length) {
      const prices = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .map(el => el.innerText.trim())
          .filter(Boolean)
          .slice(0, 20);
      }, config.selectors.prices[0]);
      data.prices = prices;
    }
    
    // Include pagination info if available
    data.pagination = config.pagination;
    
    // Include pattern info
    data.patterns = config.patterns;
    
    // Include auth info
    data.authRequired = config.auth?.required;
    
    // Add metadata
    data._learned = {
      siteName: config.originalName || 'unknown',
      learnedAt: config.learnedAt,
      domain: config.domain,
    };
    
    return data;
    
  } finally {
    await browser.close();
  }
}

/**
 * Delete a learned site configuration
 * @param {string} name - Name of the site to forget
 * @returns {boolean} True if deleted, false if not found
 */
function forget(name) {
  const filePath = path.join(LEARNED_SITES_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.unlinkSync(filePath);
  console.error(`[site-learner] Deleted configuration for "${name}"`);
  return true;
}

module.exports = {
  learn,
  save,
  recall,
  refresh,
  list,
  scrapeWithConfig,
  forget,
  LEARNED_SITES_DIR,
};
