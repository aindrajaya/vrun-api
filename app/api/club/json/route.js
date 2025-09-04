import { NextResponse } from 'next/server';
import { 
  getClubActivitiesWithFallback, 
  getLastWeekRange, 
  getThisWeekRange, 
  filterActivitiesByDateRange,
  formatDistance,
  formatTime,
  calculatePace
} from '../../../../lib/strava';
import { CLUB_CONFIG } from '../../../../lib/config';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get('clubId') || CLUB_CONFIG.DEFAULT_CLUB_ID;
    
    // Get access token from environment or headers
    const accessToken = process.env.DEFAULT_ACCESS_TOKEN || 
                       request.headers.get('authorization')?.replace('Bearer ', '');
    
    // For demo purposes, we'll proceed even without token and use local fallback
    const useLocalFallback = CLUB_CONFIG.USE_LOCAL_FALLBACK;
    
    // Skip API call entirely if FORCE_LOCAL_DATA is enabled
    let allActivities;
    if (CLUB_CONFIG.FORCE_LOCAL_DATA) {
      console.log('FORCE_LOCAL_DATA enabled, using local data directly...');
      const { getLocalClubActivities } = await import('../../../../lib/strava');
      allActivities = await getLocalClubActivities();
    } else {
      if (!accessToken && !useLocalFallback) {
        return NextResponse.json(
          { error: 'Access token is required' },
          { status: 401 }
        );
      }

      // Fetch activities with fallback support
      allActivities = await getClubActivitiesWithFallback(
        clubId, 
        accessToken, 
        useLocalFallback
      );
    }

    // Get date ranges
    const lastWeekRange = getLastWeekRange();
    const thisWeekRange = getThisWeekRange();

    // Filter activities by date ranges
    const lastWeekActivities = filterActivitiesByDateRange(
      allActivities, 
      lastWeekRange.start, 
      lastWeekRange.end
    );
    
    const thisWeekActivities = filterActivitiesByDateRange(
      allActivities, 
      thisWeekRange.start, 
      thisWeekRange.end
    );

    // Format activities for better presentation
    const formatActivity = (activity) => ({
      id: activity.id,
      name: activity.name,
      athlete: {
        id: activity.athlete?.id,
        firstname: activity.athlete?.firstname,
        lastname: activity.athlete?.lastname,
      },
      distance: {
        meters: activity.distance,
        formatted: formatDistance(activity.distance)
      },
      moving_time: {
        seconds: activity.moving_time,
        formatted: formatTime(activity.moving_time)
      },
      elapsed_time: {
        seconds: activity.elapsed_time,
        formatted: formatTime(activity.elapsed_time)
      },
      pace: calculatePace(activity.distance, activity.moving_time),
      total_elevation_gain: activity.total_elevation_gain,
      type: activity.type,
      sport_type: activity.sport_type,
      start_date: activity.start_date,
      start_date_local: activity.start_date_local,
      workout_type: activity.workout_type
    });

    const formattedLastWeek = lastWeekActivities.map(formatActivity);
    const formattedThisWeek = thisWeekActivities.map(formatActivity);

    // Calculate summary statistics
    const calculateSummary = (activities) => ({
      total_activities: activities.length,
      total_distance: {
        meters: activities.reduce((sum, activity) => sum + (activity.distance || 0), 0),
        formatted: formatDistance(activities.reduce((sum, activity) => sum + (activity.distance || 0), 0))
      },
      total_moving_time: {
        seconds: activities.reduce((sum, activity) => sum + (activity.moving_time || 0), 0),
        formatted: formatTime(activities.reduce((sum, activity) => sum + (activity.moving_time || 0), 0))
      },
      total_elevation_gain: activities.reduce((sum, activity) => sum + (activity.total_elevation_gain || 0), 0),
      unique_athletes: [...new Set(activities.map(activity => activity.athlete?.id).filter(Boolean))].length
    });

    const response = {
      club_id: clubId,
      generated_at: new Date().toISOString(),
      date_ranges: {
        last_week: {
          start: lastWeekRange.start.toISOString(),
          end: lastWeekRange.end.toISOString()
        },
        this_week: {
          start: thisWeekRange.start.toISOString(),
          end: thisWeekRange.end.toISOString()
        }
      },
      summary: {
        last_week: calculateSummary(lastWeekActivities),
        this_week: calculateSummary(thisWeekActivities)
      },
      activities: {
        last_week: formattedLastWeek,
        this_week: formattedThisWeek
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in club activities API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch club activities',
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
