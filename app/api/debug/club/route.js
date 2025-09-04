import { NextResponse } from 'next/server';
import { 
  getClubActivitiesWithFallback, 
  getLastWeekRange, 
  getThisWeekRange, 
  filterActivitiesByDateRange
} from '../../../../lib/strava';
import { CLUB_CONFIG } from '../../../../lib/config';

export async function GET(request) {
  try {
    console.log('=== DEBUG ENDPOINT START ===');
    
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get('clubId') || CLUB_CONFIG.DEFAULT_CLUB_ID;
    
    console.log('Config:', {
      clubId,
      FORCE_LOCAL_DATA: CLUB_CONFIG.FORCE_LOCAL_DATA,
      USE_LOCAL_FALLBACK: CLUB_CONFIG.USE_LOCAL_FALLBACK,
    });
    
    // Get access token from environment or headers
    const accessToken = process.env.DEFAULT_ACCESS_TOKEN || 
                       request.headers.get('authorization')?.replace('Bearer ', '');
    
    console.log('Access token exists:', !!accessToken);
    console.log('Token first 10 chars:', accessToken?.substring(0, 10) + '...');
    
    // Skip API call entirely if FORCE_LOCAL_DATA is enabled
    let allActivities;
    if (CLUB_CONFIG.FORCE_LOCAL_DATA) {
      console.log('FORCE_LOCAL_DATA enabled, using local data directly...');
      const { getLocalClubActivities } = await import('../../../../lib/strava');
      allActivities = await getLocalClubActivities();
    } else {
      console.log('Fetching from Strava API...');
      allActivities = await getClubActivitiesWithFallback(
        clubId, 
        accessToken, 
        CLUB_CONFIG.USE_LOCAL_FALLBACK
      );
    }

    console.log('Total activities fetched:', allActivities.length);
    console.log('First activity sample:', allActivities[0] ? {
      id: allActivities[0].id,
      name: allActivities[0].name,
      athlete: allActivities[0].athlete,
      distance: allActivities[0].distance,
      start_date: allActivities[0].start_date
    } : 'No activities');

    // Get date ranges
    const lastWeekRange = getLastWeekRange();
    const thisWeekRange = getThisWeekRange();
    
    console.log('Date ranges:', {
      lastWeek: {
        start: lastWeekRange.start.toISOString(),
        end: lastWeekRange.end.toISOString()
      },
      thisWeek: {
        start: thisWeekRange.start.toISOString(),
        end: thisWeekRange.end.toISOString()
      }
    });

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

    console.log('Filtered activities:', {
      lastWeek: lastWeekActivities.length,
      thisWeek: thisWeekActivities.length
    });

    const response = {
      debug_info: {
        config: {
          clubId,
          FORCE_LOCAL_DATA: CLUB_CONFIG.FORCE_LOCAL_DATA,
          USE_LOCAL_FALLBACK: CLUB_CONFIG.USE_LOCAL_FALLBACK,
          has_access_token: !!accessToken
        },
        data_summary: {
          total_activities: allActivities.length,
          last_week_activities: lastWeekActivities.length,
          this_week_activities: thisWeekActivities.length,
          date_ranges: {
            lastWeek: {
              start: lastWeekRange.start.toISOString(),
              end: lastWeekRange.end.toISOString()
            },
            thisWeek: {
              start: thisWeekRange.start.toISOString(),
              end: thisWeekRange.end.toISOString()
            }
          }
        }
      },
      sample_data: {
        first_activity: allActivities[0] || null,
        last_week_sample: lastWeekActivities[0] || null,
        this_week_sample: thisWeekActivities[0] || null
      }
    };

    console.log('=== DEBUG ENDPOINT END ===');
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('Debug endpoint error:', error);
    
    return NextResponse.json(
      { 
        error: 'Debug failed',
        details: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
