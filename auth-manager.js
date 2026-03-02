#!/usr/bin/env node

/**
 * Auth Manager for Universal Scraper
 * Handles session storage, token refresh, and authentication
 */

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Get session file path
 */
function getSessionPath(platform) {
  return path.join(SESSIONS_DIR, `${platform}.json`);
}

/**
 * Save session data
 */
function saveSession(platform, data) {
  ensureSessionsDir();
  const sessionPath = getSessionPath(platform);
  
  const sessionData = {
    platform,
    savedAt: new Date().toISOString(),
    ...data,
  };
  
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  console.error(`Session saved for ${platform}`);
  
  return sessionData;
}

/**
 * Load session data
 */
function loadSession(platform) {
  const sessionPath = getSessionPath(platform);
  
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(sessionPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading session ${platform}:`, err.message);
    return null;
  }
}

/**
 * Delete session
 */
function deleteSession(platform) {
  const sessionPath = getSessionPath(platform);
  
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    console.error(`Session deleted for ${platform}`);
    return true;
  }
  
  return false;
}

/**
 * List all saved sessions
 */
function listSessions() {
  ensureSessionsDir();
  
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  
  return files.map(f => {
    const data = loadSession(f.replace('.json', ''));
    return {
      platform: f.replace('.json', ''),
      savedAt: data?.savedAt || 'unknown',
      hasTokens: !!(data?.tokens || data?.cookies),
      hasCredentials: !!(data?.credentials),
      expiresAt: data?.expiresAt || null,
    };
  });
}

/**
 * Check if token is expired
 */
function isTokenExpired(session) {
  if (!session || !session.expiresAt) {
    return true; // No expiry = assume expired
  }
  
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  
  // Consider expired if less than 5 minutes remaining
  const bufferMs = 5 * 60 * 1000;
  
  return expiresAt.getTime() - now.getTime() < bufferMs;
}

/**
 * Check if session needs refresh (within threshold)
 */
function needsRefresh(session, thresholdMinutes = 10) {
  if (!session || !session.expiresAt) {
    return false;
  }
  
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const thresholdMs = thresholdMinutes * 60 * 1000;
  
  return expiresAt.getTime() - now.getTime() < thresholdMs;
}

/**
 * Simulate token refresh (customize per platform)
 */
async function refreshToken(platform, session) {
  // This is a placeholder - implement platform-specific refresh logic
  console.error(`Refreshing token for ${platform}...`);
  
  // Example implementation would use refresh_token grant
  // For now, return the existing session
  return {
    ...session,
    refreshedAt: new Date().toISOString(),
    // Add new tokens here from actual refresh call
  };
}

/**
 * Perform login and save session
 */
async function performLogin(platform, credentials) {
  const { user, pass } = credentials;
  
  console.error(`Performing login for ${platform}...`);
  
  // This is a placeholder - implement actual login logic per platform
  // In a real implementation, you'd use Playwright to navigate to login page,
  // fill credentials, handle 2FA, etc.
  
  const session = {
    platform,
    credentials: { user, pass: '***' }, // Don't store plain password
    tokens: {
      accessToken: `mock_access_token_${Date.now()}`,
      refreshToken: `mock_refresh_token_${Date.now()}`,
    },
    cookies: [],
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    loggedInAt: new Date().toISOString(),
  };
  
  // Save the session
  return saveSession(platform, session);
}

/**
 * Get valid session (auto-refresh if needed)
 */
async function getValidSession(platform, autoRefresh = false) {
  const session = loadSession(platform);
  
  if (!session) {
    throw new Error(`No session found for ${platform}. Run with --login first.`);
  }
  
  if (isTokenExpired(session)) {
    if (autoRefresh && session.tokens?.refreshToken) {
      console.error('Token expired, refreshing...');
      const refreshed = await refreshToken(platform, session);
      saveSession(platform, refreshed);
      return refreshed;
    } else {
      throw new Error(`Session expired for ${platform}. Run with --login or --auto-refresh.`);
    }
  }
  
  // Early refresh if within threshold
  if (autoRefresh && needsRefresh(session, 10)) {
    console.error('Token expiring soon, refreshing proactively...');
    const refreshed = await refreshToken(platform, session);
    saveSession(platform, refreshed);
    return refreshed;
  }
  
  return session;
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'list') {
    const sessions = listSessions();
    console.log(JSON.stringify(sessions, null, 2));
  } else if (command === 'delete' && args[1]) {
    deleteSession(args[1]);
  } else if (command === 'check' && args[1]) {
    const session = loadSession(args[1]);
    if (session) {
      console.log(JSON.stringify({
        platform: session.platform,
        expiresAt: session.expiresAt,
        isExpired: isTokenExpired(session),
        needsRefresh: needsRefresh(session, 10),
      }, null, 2));
    } else {
      console.error(`No session found for ${args[1]}`);
      process.exit(1);
    }
  } else {
    console.error('Usage: node auth-manager.js <command>');
    console.error('Commands:');
    console.error('  list              List all saved sessions');
    console.error('  delete <platform> Delete a session');
    console.error('  check <platform>  Check session status');
  }
}

module.exports = {
  saveSession,
  loadSession,
  deleteSession,
  listSessions,
  isTokenExpired,
  needsRefresh,
  refreshToken,
  performLogin,
  getValidSession,
  SESSIONS_DIR,
};
