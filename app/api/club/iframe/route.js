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
        const errorHtml = generateErrorHtml('Access token is required');
        return new NextResponse(errorHtml, {
          status: 401,
          headers: { 'Content-Type': 'text/html' }
        });
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

    // Generate HTML
    const html = generateClubActivitiesHtml({
      clubId,
      lastWeekRange,
      thisWeekRange,
      lastWeekActivities,
      thisWeekActivities
    });

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Error in club activities iframe API:', error);
    
    const errorHtml = generateErrorHtml(`Failed to fetch club activities: ${error.message}`);
    return new NextResponse(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

function generateErrorHtml(message) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Club Activities</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .error-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .error-icon {
            font-size: 48px;
            color: #ff4444;
            margin-bottom: 16px;
        }
        .error-message {
            font-size: 18px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-message">${message}</div>
    </div>
</body>
</html>`;
}

function generateClubActivitiesHtml({ clubId, lastWeekRange, thisWeekRange, lastWeekActivities, thisWeekActivities }) {
  // Calculate summary statistics
  const calculateSummary = (activities) => ({
    total_activities: activities.length,
    total_distance: activities.reduce((sum, activity) => sum + (activity.distance || 0), 0),
    total_moving_time: activities.reduce((sum, activity) => sum + (activity.moving_time || 0), 0),
    total_elevation_gain: activities.reduce((sum, activity) => sum + (activity.total_elevation_gain || 0), 0),
    unique_athletes: [...new Set(activities.map(activity => activity.athlete?.id).filter(Boolean))].length
  });

  const lastWeekSummary = calculateSummary(lastWeekActivities);
  const thisWeekSummary = calculateSummary(thisWeekActivities);

  const generateActivityRows = (activities) => {
    if (activities.length === 0) {
      return '<tr><td colspan="6" style="text-align: center; color: #666; font-style: italic;">No activities found</td></tr>';
    }

    return activities.map(activity => `
      <tr>
        <td style="font-weight: 500;">${activity.athlete?.firstname || ''} ${activity.athlete?.lastname || 'Unknown'}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${activity.name || ''}">${activity.name || 'Untitled'}</td>
        <td>${formatDistance(activity.distance)}</td>
        <td>${formatTime(activity.moving_time)}</td>
        <td>${calculatePace(activity.distance, activity.moving_time)}</td>
        <td>${activity.type || 'Unknown'}</td>
      </tr>
    `).join('');
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Club Activities - Weekly Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            margin: 0;
            padding: 16px;
            background-color: #f8f9fa;
            color: #333;
            font-size: 14px;
            line-height: 1.5;
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b35, #f7931e);
            color: white;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        
        .header p {
            margin: 4px 0 0 0;
            opacity: 0.9;
            font-size: 14px;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .summary-card h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            color: #2d3748;
        }
        
        .summary-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #ff6b35;
            display: block;
        }
        
        .stat-label {
            font-size: 12px;
            color: #666;
            margin-top: 2px;
        }
        
        .activities-section {
            background: white;
            border-radius: 8px;
            padding: 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            overflow: hidden;
        }
        
        .section-header {
            background: #f7f8fa;
            padding: 16px;
            border-bottom: 1px solid #e2e8f0;
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #2d3748;
        }
        
        .activities-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .activities-table th {
            background: #f7f8fa;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: #4a5568;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .activities-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
        }
        
        .activities-table tr:hover {
            background: #f8f9fa;
        }
        
        .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 20px;
            padding: 16px;
        }
        
        @media (max-width: 768px) {
            .summary-grid {
                grid-template-columns: 1fr;
            }
            
            .summary-stats {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .activities-table {
                font-size: 12px;
            }
            
            .activities-table th,
            .activities-table td {
                padding: 8px 4px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏃 Club Activities Report</h1>
        <p>Weekly comparison • Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>📅 Last Week (${lastWeekRange.start.toLocaleDateString()} - ${lastWeekRange.end.toLocaleDateString()})</h3>
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${lastWeekSummary.total_activities}</span>
                    <div class="stat-label">Activities</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${lastWeekSummary.unique_athletes}</span>
                    <div class="stat-label">Athletes</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatDistance(lastWeekSummary.total_distance)}</span>
                    <div class="stat-label">Total Distance</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatTime(lastWeekSummary.total_moving_time)}</span>
                    <div class="stat-label">Total Time</div>
                </div>
            </div>
        </div>

        <div class="summary-card">
            <h3>📅 This Week (${thisWeekRange.start.toLocaleDateString()} - ${thisWeekRange.end.toLocaleDateString()})</h3>
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${thisWeekSummary.total_activities}</span>
                    <div class="stat-label">Activities</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${thisWeekSummary.unique_athletes}</span>
                    <div class="stat-label">Athletes</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatDistance(thisWeekSummary.total_distance)}</span>
                    <div class="stat-label">Total Distance</div>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatTime(thisWeekSummary.total_moving_time)}</span>
                    <div class="stat-label">Total Time</div>
                </div>
            </div>
        </div>
    </div>

    <div class="activities-section">
        <h3 class="section-header">Last Week Activities</h3>
        <table class="activities-table">
            <thead>
                <tr>
                    <th>Athlete</th>
                    <th>Activity</th>
                    <th>Distance</th>
                    <th>Time</th>
                    <th>Pace</th>
                    <th>Type</th>
                </tr>
            </thead>
            <tbody>
                ${generateActivityRows(lastWeekActivities)}
            </tbody>
        </table>
    </div>

    <div class="activities-section">
        <h3 class="section-header">This Week Activities</h3>
        <table class="activities-table">
            <thead>
                <tr>
                    <th>Athlete</th>
                    <th>Activity</th>
                    <th>Distance</th>
                    <th>Time</th>
                    <th>Pace</th>
                    <th>Type</th>
                </tr>
            </thead>
            <tbody>
                ${generateActivityRows(thisWeekActivities)}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>🏃 Powered by Strava API • Club ID: ${clubId} • Last updated: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>`;
}
