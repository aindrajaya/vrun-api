# Club Activities API

A Next.js API that fetches Strava club activities for the current week and last week, providing both JSON and iframe endpoints for easy integration.

## Features

- 🏃 **Weekly Comparison**: Shows activities from last week vs this week
- 📊 **Summary Statistics**: Total activities, distance, time, and unique athletes
- 🔄 **Fallback Support**: Uses local data when Strava API is unavailable
- 🎨 **Two Output Formats**: JSON API and embeddable HTML iframe
- 📱 **Mobile Responsive**: HTML output works on all devices

## API Endpoints

### GET `/api/club/json`

Returns club activities data in JSON format.

**Response Structure:**
```json
{
  "club_id": "12345",
  "generated_at": "2025-09-04T10:30:00.000Z",
  "date_ranges": {
    "last_week": {
      "start": "2025-08-24T00:00:00.000Z",
      "end": "2025-08-30T23:59:59.999Z"
    },
    "this_week": {
      "start": "2025-08-31T00:00:00.000Z",
      "end": "2025-09-06T23:59:59.999Z"
    }
  },
  "summary": {
    "last_week": {
      "total_activities": 25,
      "total_distance": { "meters": 125000, "formatted": "125.00 km" },
      "total_moving_time": { "seconds": 36000, "formatted": "10:00:00" },
      "unique_athletes": 8
    },
    "this_week": { /* similar structure */ }
  },
  "activities": {
    "last_week": [
      {
        "id": "activity_id",
        "name": "Morning Run",
        "athlete": {
          "firstname": "John",
          "lastname": "Doe"
        },
        "distance": {
          "meters": 5000,
          "formatted": "5.00 km"
        },
        "moving_time": {
          "seconds": 1800,
          "formatted": "00:30:00"
        },
        "pace": "6:00",
        "type": "Run",
        "start_date": "2025-08-25T06:00:00.000Z"
      }
    ],
    "this_week": [ /* similar structure */ ]
  }
}
```

### GET `/api/club/iframe`

Returns an HTML page suitable for embedding in an iframe.

**Features:**
- Clean, responsive design
- Summary cards for both weeks
- Detailed activity tables
- Mobile-friendly layout
- Embedded CSS for standalone use

**Embed Example:**
```html
<iframe 
  src="https://yoursite.com/api/club/iframe" 
  width="100%" 
  height="600" 
  frameborder="0">
</iframe>
```

## Query Parameters

Both endpoints accept these optional query parameters:

- `clubId`: Strava club ID (defaults to configured club)

Example:
```
GET /api/club/json?clubId=54321
```

## Authentication

### Strava API Token

Pass your Strava access token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" 
  https://yoursite.com/api/club/json
```

### Local Fallback

For development and demo purposes, the API will fall back to local club data if no access token is provided and `USE_LOCAL_FALLBACK` is enabled in the configuration.

## Configuration

Edit `lib/config.js` to customize:

```javascript
export const CLUB_CONFIG = {
  DEFAULT_CLUB_ID: '12345',        // Your Strava club ID
  USE_LOCAL_FALLBACK: true,        // Enable local data fallback
  MAX_PAGES_TO_FETCH: 3,          // API pagination limit
  ACTIVITIES_PER_PAGE: 100,       // Activities per API call
};
```

## Environment Variables

Create a `.env.local` file:

```bash
# Strava API Configuration
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:3000/auth/strava/callback

# Default Access Token (for testing)
DEFAULT_ACCESS_TOKEN=your_access_token
```

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your Strava app:**
   - Go to https://www.strava.com/settings/api
   - Create a new application
   - Set the authorization callback domain to your domain

3. **Update configuration:**
   - Edit `lib/config.js` with your club ID
   - Update `.env.local` with your Strava credentials

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Visit the demo page:**
   Open http://localhost:3000 to see the interactive demo

## Data Structure

The API processes Strava activities and formats them with:

- **Distance**: Meters and formatted km
- **Time**: Seconds and formatted HH:MM:SS
- **Pace**: Calculated pace in min/km format
- **Athlete Info**: Name and ID from Strava
- **Activity Details**: Type, name, elevation gain

## Week Calculation

- **Week Start**: Sunday 00:00:00
- **This Week**: Current Sunday to Saturday
- **Last Week**: Previous Sunday to Saturday

You can modify the week start day in `lib/config.js`.

## Error Handling

The API includes comprehensive error handling:

- **401**: Missing or invalid access token
- **500**: Strava API errors or server issues
- **Fallback**: Automatic fallback to local data when configured

## Rate Limiting

To respect Strava's API limits:

- Maximum 3 pages fetched per request
- 100 activities per page
- Built-in error handling for rate limit responses

## Styling (iframe)

The HTML iframe includes embedded CSS with:
- Responsive grid layouts
- Strava-inspired color scheme
- Mobile-friendly tables
- Clean typography
- Shadow effects and rounded corners

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is open source and available under the [MIT License](LICENSE).
