import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const accessToken = process.env.DEFAULT_ACCESS_TOKEN;
    const clubId = process.env.STRAVA_CLUB_ID || '897025';
    
    console.log('Testing Strava API with:');
    console.log('- Club ID:', clubId);
    console.log('- Token (first 10 chars):', accessToken?.substring(0, 10) + '...');
    
    // Test 1: Get athlete info (simpler endpoint)
    console.log('Testing athlete endpoint...');
    const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Athlete endpoint status:', athleteResponse.status);
    
    if (athleteResponse.ok) {
      const athlete = await athleteResponse.json();
      console.log('✅ Athlete API works! User:', athlete.firstname, athlete.lastname);
      
      // Test 2: Get club activities
      console.log('Testing club activities endpoint...');
      const clubResponse = await fetch(
        `https://www.strava.com/api/v3/clubs/${clubId}/activities?per_page=10`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      console.log('Club activities status:', clubResponse.status);
      
      if (clubResponse.ok) {
        const activities = await clubResponse.json();
        console.log('✅ Club Activities API works! Found', activities.length, 'activities');
        
        return NextResponse.json({
          success: true,
          athlete: {
            name: `${athlete.firstname} ${athlete.lastname}`,
            id: athlete.id
          },
          club: {
            id: clubId,
            activities_count: activities.length,
            sample_activity: activities[0] ? {
              name: activities[0].name,
              distance: activities[0].distance,
              athlete: activities[0].athlete
            } : null
          },
          message: 'Both Strava API endpoints are working!'
        });
      } else {
        const errorText = await clubResponse.text();
        return NextResponse.json({
          success: false,
          athlete_api: 'working',
          club_api: 'failed',
          error: `Club API error: ${clubResponse.status} - ${errorText}`,
          club_id: clubId,
          suggestions: [
            'Check if you have access to this club',
            'Verify the club ID is correct',
            'Ensure your token has the required scopes'
          ]
        });
      }
    } else {
      const errorText = await athleteResponse.text();
      return NextResponse.json({
        success: false,
        error: `Authentication failed: ${athleteResponse.status} - ${errorText}`,
        suggestions: [
          'Check if your access token is valid',
          'Try refreshing your token',
          'Verify your Strava app credentials'
        ]
      });
    }

  } catch (error) {
    console.error('Strava API test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Network or server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
