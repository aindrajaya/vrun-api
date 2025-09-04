/**
 * Configuration file for the club activities API
 */

// Club configuration
export const CLUB_CONFIG = {
  // Default club ID - now uses the real club ID from environment
  DEFAULT_CLUB_ID: process.env.STRAVA_CLUB_ID || '897025', 
  
  // Whether to use local fallback data when API fails or no token provided
  USE_LOCAL_FALLBACK: false,
  
  // Whether to skip API call entirely and use local data directly (for demo/development)
  FORCE_LOCAL_DATA: false, // Set to false when you have valid Strava credentials
  
  // Path to local club data
  LOCAL_DATA_PATH: './club.json',
  
  // API rate limiting
  MAX_PAGES_TO_FETCH: 3,
  ACTIVITIES_PER_PAGE: 100,
};

// Strava API configuration
export const STRAVA_CONFIG = {
  BASE_URL: 'https://www.strava.com/api/v3',
  TIMEOUT: 10000, // 10 seconds
};

// Date and time configuration
export const DATE_CONFIG = {
  // Start of week (0 = Sunday, 1 = Monday, etc.)
  WEEK_START_DAY: 0, // Sunday
  
  // Timezone for date calculations
  TIMEZONE: 'UTC',
};
