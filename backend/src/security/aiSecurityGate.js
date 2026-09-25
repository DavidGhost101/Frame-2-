/**
 * AI Security Gate & Tool Classification Matrix
 *
 * Implements:
 * 1. Tool Classification Matrix (PUBLIC, USER_AUTHENTICATED, USER_OWNED, SENSITIVE, ADMIN, HIGH_RISK)
 * 2. AI Data Boundary (Scrubbing secrets, passwords, system keys, PII before AI model generation)
 * 3. Prompt Injection Defense (Detecting jailbreak attempts, instruction override attacks, and privilege escalation)
 * 4. Tool Execution Enforcement: The backend code is the authority, not the AI model prompt.
 */

const TOOL_CLASSIFICATIONS = {
  // Public tools
  'searchListings': 'PUBLIC',
  'getListingDetails': 'PUBLIC',
  'getSowetoMarketStats': 'PUBLIC',
  'calculateBudget': 'PUBLIC',
  'getSafetyGuidelines': 'PUBLIC',

  // User Authenticated
  'createRoomRequest': 'USER_AUTHENTICATED',
  'trackListingContact': 'PUBLIC',
  'sendListingMessage': 'USER_AUTHENTICATED',

  // User Owned
  'createListing': 'USER_OWNED',
  'updateMyListing': 'USER_OWNED',
  'deleteMyListing': 'USER_OWNED',
  'getMyProfile': 'USER_OWNED',
  'updateMyProfile': 'USER_OWNED',

  // Admin Tools
  'approveListing': 'ADMIN',
  'rejectListing': 'ADMIN',
  'suspendListing': 'ADMIN',
  'blockLandlord': 'ADMIN',
  'unblockLandlord': 'ADMIN',
  'setLandlordPaid': 'ADMIN',
  'getAuditLogs': 'ADMIN',
  'exportSystemReport': 'ADMIN',
  'manageUsers': 'ADMIN',
  'broadcastNotification': 'ADMIN',

  // Sensitive & High Risk
  'directDatabaseQuery': 'HIGH_RISK',
  'overrideSystemSettings': 'HIGH_RISK',
  'viewSystemCredentials': 'HIGH_RISK'
};

class AiSecurityGate {
  /**
   * Sanitizes user input directed to the AI advisor to neutralize prompt injection attacks.
   *
   * @param {string} input - Raw user input
   * @returns {{ safeText: string, flagged: boolean, flagReason: string|null }}
   */
  sanitizePrompt(input) {
    if (!input || typeof input !== 'string') {
      return { safeText: '', flagged: false, flagReason: null };
    }

    const trimmed = input.trim();

    // Jailbreak and instruction override detection patterns
    const injectionPatterns = [
      /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
      /you\s+are\s+now\s+(in\s+)?(developer|dan|unrestricted|god)\s+mode/i,
      /reveal\s+(the\s+)?(system\s+prompt|api\s*key|jwt|password|secret|env)/i,
      /system\s*:\s*you\s+must/i,
      /sudo\s+mode/i,
      /disregard\s+(all\s+)?rules/i,
      /elevate\s+(my\s+)?privileges/i
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(trimmed)) {
        return {
          safeText: 'I cannot comply with requests that attempt to override system security guidelines. How can I help you find housing in Soweto?',
          flagged: true,
          flagReason: `Prompt injection pattern detected: ${pattern}`
        };
      }
    }

    // Limit maximum prompt length to prevent token-exhaustion denial of service
    const maxChars = 2000;
    const safeText = trimmed.length > maxChars ? trimmed.substring(0, maxChars) : trimmed;

    return {
      safeText,
      flagged: false,
      flagReason: null
    };
  }

  /**
   * AI Data Boundary Enforcement:
   * Strips out system secrets, API keys, password hashes, admin keys, and sensitive PII
   * before sending context data to an AI model.
   *
   * @param {*} data - Raw context data
   * @returns {*} Scrubbed context data
   */
  scrubContextData(data) {
    if (!data) return data;

    if (typeof data === 'string') {
      return data
        .replace(/[a-zA-Z0-9_-]{20,}/g, (match) => {
          // Check if looks like a token or api key
          if (/AIza[0-9A-Za-z-_]{35}/.test(match)) return '[REDACTED_API_KEY]';
          if (/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/.test(match)) return '[REDACTED_JWT]';
          return match;
        })
        .replace(/(\+?27|0)[6-8][0-9]{8}/g, '[REDACTED_PHONE]');
    }

    if (Array.isArray(data)) {
      return data.map(item => this.scrubContextData(item));
    }

    if (typeof data === 'object') {
      const scrubbed = {};
      const sensitiveKeySubstrings = [
        'password', 'hash', 'token', 'secret', 'key', 'auth', 'cookie',
        'database', 'credential', 'salt', 'admin'
      ];

      for (const [key, val] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeySubstrings.some(s => lowerKey.includes(s))) {
          continue; // Strip sensitive key entirely from AI context
        }

        // Mask raw phone numbers and emails to preserve privacy
        if (lowerKey === 'phone' || lowerKey === 'mobilenumber') {
          scrubbed[key] = '[MASKED_PHONE]';
        } else if (lowerKey === 'email') {
          scrubbed[key] = '[MASKED_EMAIL]';
        } else {
          scrubbed[key] = this.scrubContextData(val);
        }
      }
      return scrubbed;
    }

    return data;
  }

  /**
   * Authorizes and intercepts tool execution:
   * Rejects unauthorized tool invocation before it reaches code execution.
   */
  authorizeToolInvocation(user, toolName, params = {}) {
    const classification = TOOL_CLASSIFICATIONS[toolName];
    if (!classification) {
      return {
        allowed: false,
        error: `Tool "${toolName}" is not registered in the tool security classification matrix.`,
        code: 'UNREGISTERED_TOOL'
      };
    }

    if (classification === 'HIGH_RISK') {
      return {
        allowed: false,
        error: `Tool "${toolName}" is classified as HIGH_RISK and cannot be executed autonomously.`,
        code: 'FORBIDDEN_HIGH_RISK_TOOL'
      };
    }

    const { authEngine, ACTIONS } = require('./authorizationEngine');
    const authResult = authEngine.can(user, ACTIONS.AI_EXECUTE_TOOL, null, { toolName, params });

    if (!authResult.authorized) {
      return {
        allowed: false,
        error: authResult.reason || 'Unauthorized to execute tool.',
        code: authResult.code || 'FORBIDDEN'
      };
    }

    return {
      allowed: true,
      classification
    };
  }
}

const aiSecurityGate = new AiSecurityGate();

module.exports = {
  aiSecurityGate,
  AiSecurityGate,
  TOOL_CLASSIFICATIONS
};
