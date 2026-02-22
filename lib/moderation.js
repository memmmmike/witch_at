/**
 * Witch@ Content Moderation
 *
 * - Blocks URLs
 * - Detects bigotry, masks slurs, triggers accountability
 */

// URL detection regex
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|io|co|gg|me|tv|xyz|app|dev|info|biz|us|uk|ca|au|de|fr|jp|ru|ch|nl|be|it|es|pt|pl|se|no|fi|dk|at|nz|ie|in|br|mx|ar|cl|za|kr|cn|tw|hk|sg|my|ph|th|vn|id)[^\s]*/gi;

// Bigotry wordlist - lowercase, will be matched case-insensitively
// This is a starter list - edit as needed
const BIGOTRY_TERMS = [
  // Racial slurs
  'nigger', 'nigga', 'n1gger', 'n1gga', 'nigg3r', 'nigg4',
  'chink', 'ch1nk',
  'spic', 'sp1c', 'spick',
  'wetback',
  'kike', 'k1ke',
  'gook',
  'raghead', 'towelhead',
  'beaner',
  'coon',
  'darkie',
  'jigaboo',
  'porch monkey',
  'jungle bunny',
  'sand nigger',

  // Homophobic/transphobic slurs
  'faggot', 'fag', 'f4ggot', 'f4g', 'fagg0t',
  'dyke', 'd1ke', 'dyk3',
  'tranny', 'tr4nny',
  'shemale', 'she-male',

  // Other bigotry
  'retard', 'retarded', 'r3tard',
  'tard',
];

// Build regex for efficient matching
// Handles word boundaries and common letter substitutions
function buildBigotryRegex() {
  const escaped = BIGOTRY_TERMS.map(term => {
    // Escape special regex chars
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  // Match as whole words or with common suffixes
  return new RegExp(`\\b(${escaped.join('|')})(s|ed|ing|er|ers)?\\b`, 'gi');
}

const BIGOTRY_REGEX = buildBigotryRegex();

/**
 * Check if message contains a URL
 * @param {string} text
 * @returns {boolean}
 */
function containsUrl(text) {
  return URL_REGEX.test(text);
}

/**
 * Check if message contains bigotry
 * @param {string} text
 * @returns {{ found: boolean, matches: string[] }}
 */
function detectBigotry(text) {
  const matches = text.match(BIGOTRY_REGEX);
  return {
    found: matches !== null && matches.length > 0,
    matches: matches || [],
  };
}

/**
 * Mask a slur - keeps first letter, replaces rest with asterisks
 * @param {string} word
 * @returns {string}
 */
function maskSlur(word) {
  if (word.length <= 1) return '*';
  return word[0] + '*'.repeat(word.length - 1);
}

/**
 * Mask all bigotry in a message
 * @param {string} text
 * @returns {string}
 */
function maskBigotry(text) {
  return text.replace(BIGOTRY_REGEX, (match) => maskSlur(match));
}

/**
 * Full moderation check
 * @param {string} text
 * @returns {{ allowed: boolean, reason?: string, maskedText?: string, isBigotry?: boolean }}
 */
function moderate(text) {
  // Check for URLs first
  if (containsUrl(text)) {
    return { allowed: false, reason: 'no-links' };
  }

  // Check for bigotry
  const bigotry = detectBigotry(text);
  if (bigotry.found) {
    return {
      allowed: true, // Allow but masked
      reason: 'bigotry',
      maskedText: maskBigotry(text),
      isBigotry: true,
    };
  }

  return { allowed: true };
}

module.exports = {
  containsUrl,
  detectBigotry,
  maskSlur,
  maskBigotry,
  moderate,
  BIGOTRY_TERMS, // Export for editing
};
