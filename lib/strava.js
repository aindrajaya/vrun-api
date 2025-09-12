/**
 * Strava API utility functions
 */

import fs from 'fs';
import path from 'path';

const STRAVA_BASE_URL = 'https://www.strava.com/api/v3';

/**
 * Get club activities from local fallback data
 * @param {string} filePath - Path to the local club.json file
 * @returns {Promise<Array>} Array of club activities
 */
export async function getLocalClubActivities(filePath = null) {
  try {
    const dataPath = filePath || path.join(process.cwd(), 'club.json');
    const data = fs.readFileSync(dataPath, 'utf8');
    const activities = JSON.parse(data);
    
    // Filter out incomplete activities and add mock dates for demo
    return activities
      .filter(activity => 
        activity && 
        activity.athlete && 
        activity.name && 
        activity.distance !== undefined
      )
      .map((activity, index) => {
        // Add mock start dates for demo purposes
        // Distribute activities across the last 2 weeks for demonstration
        const now = new Date();
        const daysAgo = Math.floor(Math.random() * 14); // 0-14 days ago
        const activityDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        
        // Normalize the local data to match Strava API format
        const activityWithDates = {
          ...activity,
          id: activity.id || `local_${index}`,
          start_date: activityDate.toISOString(),
          start_date_local: activityDate.toISOString(),
        };
        
        return normalizeActivityData(activityWithDates);
      })
      .filter(activity => activity !== null);
  } catch (error) {
    console.error('Error reading local club activities:', error);
    return [];
  }
}

/**
 * Get club activities with fallback to local data
 * @param {string} clubId - The Strava club ID
 * @param {string} accessToken - The access token for Strava API
 * @param {boolean} useLocal - Whether to use local data as fallback
 * @returns {Promise<Array>} Array of club activities
 */
export async function getClubActivitiesWithFallback(clubId, accessToken, useLocal = true) {
  // If no access token and local fallback is enabled, skip API call
  if (!accessToken && useLocal) {
    console.log('No access token provided, using local club data directly...');
    return await getLocalClubActivities();
  }

  // If we have a token, try the API first
  if (accessToken) {
    try {
      let allActivities = [];
      let page = 1;
      const perPage = 10;
      let hasMoreActivities = true;

      while (hasMoreActivities && page <= 3) {
        try {
          const activities = await getClubActivities(clubId, accessToken, page, perPage);
          
          if (activities.length === 0) {
            hasMoreActivities = false;
          } else {
            allActivities = [...allActivities, ...activities];
            page++;
            
            if (activities.length < perPage) {
              hasMoreActivities = false;
            }
          }
        } catch (error) {
          console.error(`Error fetching page ${page} from Strava:`, error.message);
          hasMoreActivities = false;
          
          // If this is the first page and failed, try local fallback
          if (page === 1 && useLocal) {
            console.log('API failed, falling back to local club data...');
            return await getLocalClubActivities();
          }
        }
      }

      // If we got some activities from API, return them
      if (allActivities.length > 0) {
        console.log('=== STRAVA API DATA STRUCTURE ===');
        console.log('Total activities:', allActivities.length);
        console.log('First activity structure:', JSON.stringify(allActivities[0], null, 2));
        console.log('=== END STRAVA DATA ===');
        console.log(`Successfully fetched ${allActivities.length} activities from Strava API`);
        
        // Normalize all activities to ensure consistent data structure
        const normalizedActivities = allActivities
          .map(normalizeActivityData)
          .filter(activity => activity !== null);
          
        console.log('Normalized', normalizedActivities.length, 'activities');
        return normalizedActivities;
      }
    } catch (error) {
      console.error('Error in Strava API call:', error.message);
    }
  }

  // If API failed or no token, and we want to use local fallback
  if (useLocal) {
    console.log('Using local club data as fallback...');
    return await getLocalClubActivities();
  }

  return [];
}

/**
 * Get club activities from Strava API
 * @param {string} clubId - The Strava club ID
 * @param {string} accessToken - The access token for Strava API
 * @param {number} page - Page number for pagination
 * @param {number} perPage - Number of items per page
 * @returns {Promise<Array>} Array of club activities
 */
export async function getClubActivities(clubId, accessToken, page = 1, perPage = 30) {
  try {
    const response = await fetch(
      `${STRAVA_BASE_URL}/clubs/${clubId}/activities?page=${page}&per_page=${perPage}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching club activities:', error);
    throw error;
  }
}

/**
 * Fetch a single activity by id from Strava API
 * @param {string|number} activityId
 * @param {string} accessToken
 */
export async function getActivityById(activityId, accessToken) {
  try {
    const response = await fetch(`${STRAVA_BASE_URL}/activities/${activityId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Strava activity ${activityId} error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Strava activity by id:', activityId, error.message || error);
    throw error;
  }
}

/**
 * Enrich activities that are missing date fields by fetching full activity details from Strava
 * - Limits concurrency to avoid bursting the API
 * - Merges normalized data back into the original array positions
 */
export async function enrichActivities(activities, accessToken, concurrency = 3) {
  if (!accessToken) {
    console.log('enrichActivities: no access token provided, skipping enrichment');
    return activities;
  }

  const toEnrich = activities.filter(a => a && a.id && !(a.start_date || a.start_date_local));
  if (!toEnrich.length) return activities;

  console.log(`enrichActivities: enriching ${toEnrich.length} activities with concurrency=${concurrency}`);

  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= toEnrich.length) break;
      const act = toEnrich[i];
      try {
        const full = await getActivityById(act.id, accessToken);
        // Normalize the full object and replace the original in-place if possible
        const norm = normalizeActivityData(full) || null;
        const origIndex = activities.findIndex(x => x === act || (x && x.id && x.id === act.id));
        if (origIndex !== -1) {
          activities[origIndex] = norm || activities[origIndex];
        }
      } catch (err) {
        console.warn('enrichActivities: failed to enrich', act && act.id, err.message || err);
      }
    }
  }

  const workers = new Array(Math.max(1, concurrency)).fill(0).map(() => worker());
  await Promise.all(workers);
  return activities;
}

/**
 * Get date range for last week
 * @returns {Object} Object with start and end dates for last week
 */
export function getLastWeekRange() {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate start of current week (Sunday)
  const startOfCurrentWeek = new Date(now);
  startOfCurrentWeek.setDate(now.getDate() - currentDay);
  startOfCurrentWeek.setHours(0, 0, 0, 0);
  
  // Calculate start of last week
  const startOfLastWeek = new Date(startOfCurrentWeek);
  startOfLastWeek.setDate(startOfCurrentWeek.getDate() - 7);
  
  // Calculate end of last week
  const endOfLastWeek = new Date(startOfCurrentWeek);
  endOfLastWeek.setTime(endOfLastWeek.getTime() - 1);
  
  return {
    start: startOfLastWeek,
    end: endOfLastWeek
  };
}

/**
 * Get date range for this week
 * @returns {Object} Object with start and end dates for this week
 */
export function getThisWeekRange() {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate start of current week (Sunday)
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - currentDay);
  startOfThisWeek.setHours(0, 0, 0, 0);
  
  // Calculate end of current week
  const endOfThisWeek = new Date(startOfThisWeek);
  endOfThisWeek.setDate(startOfThisWeek.getDate() + 6);
  endOfThisWeek.setHours(23, 59, 59, 999);
  
  return {
    start: startOfThisWeek,
    end: endOfThisWeek
  };
}

/**
 * Filter activities by date range with better error handling
 * @param {Array} activities - Array of activities
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {Array} Filtered activities
 */
export function filterActivitiesByDateRange(activities, startDate, endDate) {
  if (!Array.isArray(activities)) {
    console.log('filterActivitiesByDateRange: activities is not an array:', typeof activities);
    return [];
  }
  
  console.log(`Filtering ${activities.length} activities between ${startDate.toISOString()} and ${endDate.toISOString()}`);
  
  const filtered = activities.filter(activity => {
    if (!activity) return false;
    
    // Try multiple date fields
    const dateStr = activity.start_date || activity.start_date_local;
    if (!dateStr) {
      console.log('Activity missing date:', activity.id || 'no-id');
      return false;
    }
    
    try {
      const activityDate = new Date(dateStr);
      if (isNaN(activityDate.getTime())) {
        console.log('Invalid date for activity:', activity.id, dateStr);
        return false;
      }
      
      const inRange = activityDate >= startDate && activityDate <= endDate;
      if (inRange) {
        console.log(`✓ Activity ${activity.name || activity.id} (${activityDate.toLocaleDateString()}) is in range`);
      }
      return inRange;
    } catch (error) {
      console.log('Date parsing error for activity:', activity.id, error.message);
      return false;
    }
  });
  
  console.log(`Filtered result: ${filtered.length} activities in range`);
  return filtered;
}

/**
 * Format distance from meters to kilometers
 * @param {number} distance - Distance in meters
 * @returns {string} Formatted distance string
 */
export function formatDistance(distance) {
  if (!distance) return '0.00 km';
  return `${(distance / 1000).toFixed(2)} km`;
}

/**
 * Format time from seconds to HH:MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  if (!seconds) return '00:00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Normalize activity data from different sources (Strava API or local data)
 * @param {Object} activity - Raw activity data
 * @returns {Object} Normalized activity data
 */
export function normalizeActivityData(activity) {
  if (!activity) return null;

  // Note: we no longer skip activities missing date fields here.
  // Empty date fields will be filled with a fallback value below.

  // Handle both Strava API and local data formats
  return {
    id: activity.id || `local_${Date.now()}_${Math.random()}`,
    name: activity.name || 'Untitled Activity',
    
    // Athlete data - handle different formats
    athlete: {
      id: activity.athlete?.id || activity.athlete?.resource_state,
      firstname: activity.athlete?.firstname || '',
      lastname: activity.athlete?.lastname || 'Unknown'
    },
    
  // Activity metrics
  distance: Number(activity.distance) || 0,
  moving_time: Number(activity.moving_time) || 0,
  elapsed_time: Number(activity.elapsed_time) || Number(activity.moving_time) || 0,
  total_elevation_gain: Number(activity.total_elevation_gain) || 0,
  // Pace as min:sec per km (computed from distance and elapsed_time)
  pace: (function(d, t){ try { return calculatePace(Number(d)||0, Number(t)||0); } catch(e) { return '00:00'; } })(activity.distance, activity.elapsed_time || activity.moving_time),
    
    // Activity type
    type: activity.type || activity.sport_type || 'Unknown',
    sport_type: activity.sport_type || activity.type || 'Unknown',
    workout_type: activity.workout_type || null,
    
    // Dates - prioritize start_date, fallback to generated dates
    start_date: activity.start_date || activity.start_date_local || new Date().toISOString(),
    start_date_local: activity.start_date_local || activity.start_date || new Date().toISOString(),
    
    // Additional fields that might be useful
    resource_state: activity.resource_state || 2
  };
}

/**
 * Calculate pace from distance and time
 * @param {number} distance - Distance in meters
 * @param {number} time - Time in seconds
 * @returns {string} Pace in min/km format
 */
export function calculatePace(distance, time) {
  if (!distance || !time) return '00:00';
  
  const distanceInKm = distance / 1000;
  const paceInSeconds = time / distanceInKm;
  
  const minutes = Math.floor(paceInSeconds / 60);
  const seconds = Math.floor(paceInSeconds % 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Remove duplicate activities based on combination of name, distance (km rounded to 2 decimals), elapsed_time, and pace
 * Keeps the first occurrence of each unique key
 * @param {Array} activities
 * @returns {Array} deduplicated activities
 */
export function dedupeActivities(activities) {
  if (!Array.isArray(activities)) return activities;
  const seen = new Set();
  const out = [];

  for (const a of activities) {
    if (!a) continue;
    const name = (a.name || '').trim();
    const distKm = ((Number(a.distance) || 0) / 1000).toFixed(2);
    const elapsed = Number(a.elapsed_time) || Number(a.moving_time) || 0;
    const pace = (() => {
      const dkm = (Number(a.distance) || 0) / 1000;
      if (!dkm || !elapsed) return '00:00';
      const paceSec = elapsed / dkm; const m = Math.floor(paceSec/60); const s = Math.floor(paceSec%60); return `${m}:${s.toString().padStart(2,'0')}`;
    })();

    const key = `${name}||${distKm}||${elapsed}||${pace}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }

  return out;
}
