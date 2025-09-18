import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

// Google Sheets API configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
// Use the requested sheet name for run submissions
const SUBMISSIONS_SHEET_NAME = process.env.GOOGLE_SUBMISSIONS_SHEET_NAME || 'WRP_run_submissions';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// Name of the registrations sheet that contains registered emails (column D)
const REGISTRATIONS_SHEET_NAME = process.env.GOOGLE_REGISTRATIONS_SHEET_NAME || 'WRP_Registrations';
// Optional: folder ID to place uploaded proof images
const DRIVE_UPLOAD_FOLDER_ID = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID || '1H7UPcajAMqSdHqSPpEUmBtSIOwTWuBjY';
// Optional: Shared Drive (Team Drive) ID to use when uploading via service accounts.
const DRIVE_SHARED_DRIVE_ID = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || '1H7UPcajAMqSdHqSPpEUmBtSIOwTWuBjY';
// Optional: set a distinct client id for Drive usage (provided by user)
// Read only from env to avoid leaking client ids in source
const DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID || '';
// OAuth2 fallback credentials (optional) - read only from environment variables to avoid leaking secrets in source
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '';
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

/**
 * Gets an authenticated Google Sheets client
 * @returns {Promise<Object>} - Authenticated Google Sheets client
 */
async function getGoogleSheetsClient() {
  try {
    // If using credentials from environment variables (recommended)
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    return sheets;
  } catch (error) {
    console.error('Error creating Google Sheets client:', error.message);
    throw new Error(`Failed to create Google Sheets client: ${error.message}`);
  }
}

/**
 * Gets an authenticated Google Drive client
 * @returns {Promise<Object>} - Authenticated Google Drive client
 */
async function getGoogleDriveClient() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    // Note: for service account auth we mainly provide credentials and scopes.
    // DRIVE_CLIENT_ID is informational here (provided to distinguish drive usage).
    console.log('Using DRIVE_CLIENT_ID for Drive operations:', DRIVE_CLIENT_ID);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    return drive;
  } catch (err) {
    console.error('Error creating Google Drive client:', err.message || err);
    throw err;
  }
}

// Helper: sanitize a string to be safe for filenames
function sanitizeForFilename(value) {
  if (!value) return 'unknown';
  const s = String(value).toLowerCase();
  // replace @ and . in emails with underscores, spaces to underscore, remove other unsafe chars
  return s.replace(/@/g, '_at_').replace(/\./g, '_').replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '').slice(0, 64);
}


/**
 * Checks if an email already exists in submissions
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} - True if email exists, false otherwise
 */
/**
 * Checks duplicate submissions and counts submissions per email.
 * Returns an object { isStravaDuplicate: boolean, emailCount: number }
 */
async function checkDuplicateSubmission(email, stravaActivity) {
  try {
    const sheets = await getGoogleSheetsClient();
    // Read columns C (Email) through E (Strava Activity)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SUBMISSIONS_SHEET_NAME}!C:E`,
    });

    const rows = response.data.values || [];
    let emailCount = 0;
    let stravaSubmittedByDifferentEmail = false;
    const emailLower = email.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const rowEmail = rows[i][0]?.toLowerCase();
      const rowStravaActivity = rows[i][2];

      if (rowEmail === emailLower) {
        emailCount++;
      }

      // Treat any identical Strava activity as a duplicate regardless of submitting email
      if (rowStravaActivity && String(rowStravaActivity).trim() === String(stravaActivity).trim()) {
        stravaSubmittedByDifferentEmail = true;
        break; // no need to keep scanning
      }
    }

    return { isStravaDuplicate: stravaSubmittedByDifferentEmail, emailCount };
  } catch (error) {
    console.error('Error checking duplicate submission:', error);
    return { isStravaDuplicate: false, emailCount: 0 }; // If check fails, allow submission to proceed
  }
}

/**
 * Checks whether the submitted email exists in the registrations sheet (column D)
 * @param {string} email
 * @returns {Promise<boolean>} true if registered
 */
async function checkEmailRegistered(email) {
  try {
    const sheets = await getGoogleSheetsClient();
    // Read column D (4th column) from registrations sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REGISTRATIONS_SHEET_NAME}!D2:D1000`,
    });

    const rows = response.data.values || [];
    const emailLower = String(email || '').toLowerCase();
    for (let i = 0; i < rows.length; i++) {
      const rowEmail = String(rows[i][0] || '').toLowerCase();
      if (rowEmail && rowEmail === emailLower) return true;
    }
    return false;
  } catch (err) {
    console.error('Error checking registrations sheet for email:', err);
    // If we can't check registrations, be conservative and reject to avoid abuse
    return false;
  }
}

// Helper: attempt to determine the service account email used by the runtime
async function getServiceAccountEmail() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      if (parsed?.client_email) return parsed.client_email;
    }

    // Try to read local credentials.json in repository root
    try {
      // eslint-disable-next-line no-undef
      const fs = await import('fs');
      const path = await import('path');
      const repoRoot = path.resolve(process.cwd());
      const credPath = path.join(repoRoot, 'credentials.json');
      if (fs.existsSync(credPath)) {
        const raw = fs.readFileSync(credPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.client_email) return parsed.client_email;
      }
    } catch (e) {
      // ignore
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Stores submission data in Google Sheets
 * @param {Object} submissionData - Submission object to store
 * @returns {Promise<Object>} - Google Sheets API response
 */
async function storeSubmissionInGoogleSheets(submissionData) {
  if (!submissionData) {
    console.warn('No submission data to store in Google Sheets');
    return { success: false, message: 'No submission data provided' };
  }

  try {
    console.log('Storing submission in Google Sheets:', submissionData);
    
    // Prepare the data for Google Sheets format
    // Columns: Date Submit, Nama Lengkap, Email, Handphone, Link Aktivitas Strava, Jarak (km), Durasi (HH:MM:SS), Foto,
    // Activity Name, Location, Activity Date, Pace, Authenticated, Auth Valid
    const columnOrder = [
      'timestamp', // Date Submit
      'name',
      'email',
      'phone',
      'stravaActivity',
      'distance',
      'duration',
      'proofFileName',
      'activity_name',
      'location',
      'activity_date',
      'pace',
      'authenticated',
      'auth_valid'
    ];

    // Convert submission object to array based on column order
    const dataToAppend = [columnOrder.map(key => {
      if (key === 'timestamp') {
        return new Date().toISOString(); // Add current timestamp
      }
      return submissionData[key] !== undefined ? submissionData[key] : '';
    })];

    // Get the Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Check if sheet exists and create headers if needed
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SUBMISSIONS_SHEET_NAME}!A1:H1`,
      });

      // If sheet is empty, add headers
      if (!response.data.values || response.data.values.length === 0) {
        console.log('Adding headers to submissions sheet (WRP_run_submissions)');
        const headers = [
          'Date Submit',
          'Nama Lengkap',
          'Email',
          'Handphone',
          'Link Aktivitas Strava',
          'Jarak (km)',
          'Durasi (HH:MM:SS)',
          'Foto',
          'Activity Name',
          'Location',
          'Activity Date',
          'Pace',
          'Authenticated',
          'Auth Valid'
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SUBMISSIONS_SHEET_NAME}!A1:H1`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [headers],
          },
        });
      }
    } catch (headerError) {
      console.log('Sheet might not exist or header check failed, continuing with data append');
    }

  // Append the submission data
  const appendRange = `${SUBMISSIONS_SHEET_NAME}!A2`; // Start appending from row 2, keep row 1 as headers
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: appendRange,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: dataToAppend,
      },
    });

    console.log('Google Sheets submission storage successful:', result.data);
    return {
      success: true,
      message: 'Submission successfully stored in Google Sheets',
      response: result.data
    };
  } catch (error) {
    console.error('Error storing submission in Google Sheets:', error.message);
    console.error('Error details:', error.response?.data || error);
    return {
      success: false,
      message: 'Failed to store submission in Google Sheets',
      error: error.message
    };
  }
}

/**
 * Resolves Strava short links to full activity URLs
 * @param {string} url - The URL to resolve (could be short link or direct URL)
 * @returns {Promise<string>} - The resolved full activity URL
 */
async function resolveStravaUrl(url) {
  if (!url) return null;

  // If it's already a direct activity URL, just ensure it has /overview
  if (url.includes('strava.com/activities/')) {
    return url.endsWith('/overview') ? url : `${url}/overview`;
  }

  // If it's a short link, resolve it
  if (url.includes('strava.app.link')) {
    try {
      console.log('Resolving short link in submit endpoint:', url);
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const resolvedUrl = response.url;
      console.log('Resolved to:', resolvedUrl);

      // Extract activity ID and create overview URL
      const activityIdMatch = resolvedUrl.match(/\/activities\/([0-9]+)/);
      if (activityIdMatch) {
        return `https://www.strava.com/activities/${activityIdMatch[1]}/overview`;
      }
    } catch (e) {
      console.error('Failed to resolve short link:', e.message);
      throw new Error('Failed to resolve Strava short link');
    }
  }

  // For any other URL format, return as-is but add /overview if it's a direct activity URL
  if (url.includes('strava.com/activities/') && !url.endsWith('/overview')) {
    return `${url}/overview`;
  }

  return url;
}
export async function POST(request) {
  try {
    console.log('=== POST /api/run/submit - Starting submission process ===');
    
    const formData = await request.formData();
    console.log('Form data received');
    
    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const rawStravaActivity = formData.get('stravaActivity');
    let distance = formData.get('distance');
    let duration = formData.get('duration');
    const proofFile = formData.get('proof');

    // Resolve Strava URL (handle short links and ensure proper format)
    let stravaActivity;
    try {
      stravaActivity = await resolveStravaUrl(rawStravaActivity);
      console.log('Resolved Strava URL:', stravaActivity);
    } catch (e) {
      console.error('Error resolving Strava URL:', e);
      return NextResponse.json(
        { error: 'Invalid Strava activity URL or failed to resolve short link' },
        { status: 400 }
      );
    }

    // Validate required fields (distance/duration will be filled from Strava scrape)
    if (!name || !email || !phone || !stravaActivity || !proofFile) {
      console.log('Validation failed: missing required fields');
      return NextResponse.json(
        { error: 'Required fields missing: name, email, phone, stravaActivity, and proof file are required' },
        { status: 400 }
      );
    }

    // Helper: parse distance string like "1.51 km" or "0.94 mi" into numeric kilometers
    const parseDistanceString = (s) => {
      if (!s) return null
      const m = String(s).match(/([0-9]+(?:\.[0-9]+)?)\s*(km|mi)/i)
      if (!m) return null
      let val = parseFloat(m[1])
      const unit = m[2].toLowerCase()
      if (unit === 'mi') val = val * 1.60934
      return Number(val.toFixed(3))
    }

    // Helper: normalize moving_time like "19:24" (mm:ss) or "1:19:24" to HH:MM:SS
    const normalizeDuration = (t) => {
      if (!t) return null
      const s = String(t).trim()
      const parts = s.split(':').map(p => Number(p))
      if (parts.length === 3 && parts.every(p => !Number.isNaN(p))) {
        return parts.map(n => String(n).padStart(2, '0')).join(':')
      }
      if (parts.length === 2 && parts.every(p => !Number.isNaN(p))) {
        // mm:ss -> 00:mm:ss
        return ['00', String(parts[0]).padStart(2, '0'), String(parts[1]).padStart(2, '0')].join(':')
      }
      // Try to parse verbose forms like "1h 2m 3s"
      const mm = s.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i)
      if (mm) {
        const h = Number(mm[1] || 0)
        const m = Number(mm[2] || 0)
        const sec = Number(mm[3] || 0)
        return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
      }
      return null
    }

    // Call internal scraper to get authoritative extracted values for the provided Strava activity
    try {
  // Use the actual request origin to build an absolute URL for internal fetch.
  const origin = new URL(request.url).origin
  const scrapeUrl = `${origin}/api/data/strava/scrape?url=${encodeURIComponent(stravaActivity)}`
  console.log("GET URL", scrapeUrl)
  console.log('Using origin for scrape:', origin)

      const scrapeHeaders = {
        'User-Agent': 'vrun-server/1.0',
        Accept: 'application/json',
      }
      // forward optional Strava session cookies if included in the form (for authenticated pages)
      const formCookieToken = formData.get('strava_remember_token')
      const formCookieId = formData.get('strava_remember_id')
      if (formCookieToken && formCookieId) {
        scrapeHeaders['x-strava-remember-token'] = formCookieToken
        scrapeHeaders['x-strava-remember-id'] = formCookieId
      }

      console.log('Fetching Strava scrape:', scrapeUrl)
      const scrapeResp = await fetch(scrapeUrl, { headers: scrapeHeaders })
      if (!scrapeResp.ok) {
        const txt = await scrapeResp.text().catch(() => '')
        console.error('Strava scrape failed:', scrapeResp.status, txt)
        return NextResponse.json({ error: 'Failed to scrape Strava activity', status: scrapeResp.status, detail: txt }, { status: 502 })
      }

      const scrapeJson = await scrapeResp.json()
      const extracted = scrapeJson.extracted || null
      if (!extracted) {
        console.error('Strava scrape returned no extracted object', scrapeJson)
        return NextResponse.json({ error: 'Strava scrape did not return extracted data', detail: scrapeJson }, { status: 502 })
      }

      // Use extracted values to fill distance and duration if missing or override to authoritative values
      const scrapedDistance = parseDistanceString(extracted.distance)
      const scrapedDuration = normalizeDuration(extracted.moving_time)

      if (!scrapedDistance || !scrapedDuration) {
        console.error('Scrape did not produce distance or duration', { extracted })
        // Try a second scrape attempt using request headers (in case cookies were sent as headers)
        try {
          const headerCookies = request.headers.get('cookie') || ''
          const altHeaders = { 'User-Agent': 'vrun-server/1.0', Accept: 'application/json' }
          if (headerCookies) altHeaders.Cookie = headerCookies
          // also forward potential x-strava-remember-* headers
          const hToken = request.headers.get('x-strava-remember-token')
          const hId = request.headers.get('x-strava-remember-id')
          if (hToken && hId) {
            altHeaders['x-strava-remember-token'] = hToken
            altHeaders['x-strava-remember-id'] = hId
          }
          // also forward cookies submitted as form fields (some clients post cookies in the form)
          const formToken = formData.get('strava_remember_token')
          const formId = formData.get('strava_remember_id')
          if (formToken && formId) {
            altHeaders['x-strava-remember-token'] = formToken
            altHeaders['x-strava-remember-id'] = formId
          }
          console.log('Retrying scrape with forwarded headers')
          const retryResp = await fetch(scrapeUrl, { headers: altHeaders })
          if (retryResp.ok) {
            const retryJson = await retryResp.json().catch(() => null)
            const retryExtracted = retryJson?.extracted || null
            const retryDist = parseDistanceString(retryExtracted?.distance)
            const retryDur = normalizeDuration(retryExtracted?.moving_time)
            if (retryDist && retryDur) {
              console.log('Retry scrape succeeded with forwarded headers')
              distance = retryDist
              duration = retryDur
              // attach scraped meta from retry
              const scrapedMeta2 = {
                activity_name: retryExtracted.activity_name || null,
                location: retryExtracted.location || null,
                date: retryExtracted.date || null,
                description: retryExtracted.description || null,
                pace: retryExtracted.pace || null,
                authenticated: retryExtracted.authenticated || false,
                auth_valid: retryExtracted.auth_valid || false,
              }
              formData.set('__scraped_meta', JSON.stringify(scrapedMeta2))
            }
          }
        } catch (retryErr) {
          console.warn('Retry scrape failed:', String(retryErr))
        }
      }
      // after retry attempt, re-evaluate
      if (!distance || !duration) {
        return NextResponse.json({ error: 'Could not extract required distance or duration from Strava activity', scraped: extracted, issues: scrapeJson.issues || [] }, { status: 400 })
      }

      // override incoming form values to ensure authoritative data
      // distance will be stored as numeric kilometers
      distance = scrapedDistance
      duration = scrapedDuration

      // attach scraped metadata to notes so it's stored with the submission
      const scrapedMeta = {
        activity_name: extracted.activity_name || null,
        location: extracted.location || null,
        date: extracted.date || null,
        description: extracted.description || null,
  pace: extracted.pace || null,
        authenticated: extracted.authenticated || false,
        auth_valid: extracted.auth_valid || false,
      }

      // append to notes (existing variable 'submission' isn't created yet — we'll attach later)
      // we'll serialize scrapedMeta into notes later when constructing submission
      formData.set('__scraped_meta', JSON.stringify(scrapedMeta))
    } catch (scrapeErr) {
      console.error('Error while scraping Strava activity:', scrapeErr)
      return NextResponse.json({ error: 'Internal error while scraping Strava', detail: String(scrapeErr) }, { status: 500 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('Validation failed: invalid email format');
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate Strava URL format
    const stravaUrlRegex = /^https:\/\/www\.strava\.com\/activities\/\d+/;
    if (!stravaUrlRegex.test(stravaActivity)) {
      console.log('Validation failed: invalid Strava URL format');
      return NextResponse.json(
        { error: 'Invalid Strava activity URL format' },
        { status: 400 }
      );
    }

    // Validate duration format (HH:MM:SS)
    const durationRegex = /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/;
    if (!durationRegex.test(duration)) {
      console.log('Validation failed: invalid duration format');
      return NextResponse.json(
        { error: 'Invalid duration format. Please use HH:MM:SS format' },
        { status: 400 }
      );
    }

    // Validate distance
    const distanceNum = parseFloat(distance);
    if (isNaN(distanceNum) || distanceNum <= 0) {
      console.log('Validation failed: invalid distance');
      return NextResponse.json(
        { error: 'Invalid distance value' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (proofFile.size > 10 * 1024 * 1024) {
      console.log('Validation failed: file too large');
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    console.log('Validation passed, creating submission object...');

    // Verify the email is registered and then check for duplicates and per-email limits
    console.log('Verifying submitted email exists in registrations...');
    try {
      const isRegistered = await checkEmailRegistered(email);
      if (!isRegistered) {
        console.log('Submitted email not found in registrations:', email);
        return NextResponse.json(
          { error: 'Email belum terdaftar, mohon menggunakan email yang gunakan saat pendaftaran' },
          { status: 403 }
        );
      }

      console.log('Checking for duplicate submission in Google Sheets...');
      const { isStravaDuplicate, emailCount } = await checkDuplicateSubmission(email, stravaActivity);
      if (isStravaDuplicate) {
        console.log('Duplicate Strava activity submission detected, returning error for', stravaActivity);
        return NextResponse.json(
          { error: `Strava link ${stravaActivity} has already been submitted` },
          { status: 409 }
        );
      }

      // Allow up to 4 submissions per email. If already 4 or more existing, reject the new submission.
      if (emailCount >= 4) {
        console.log(`Email ${email} has already submitted ${emailCount} times; rejecting additional submissions`);
        return NextResponse.json(
          { error: 'Submission limit exceeded: each email may submit up to 4 times' },
          { status: 429 }
        );
      }
    } catch (error) {
      console.error('Error checking for duplicate submission:', error);
      // Continue with submission if duplicate check fails
    }

    // Pull scraped meta (if any) and include into submission
    let scrapedMeta = null
    try {
      const raw = formData.get('__scraped_meta')
      if (raw) scrapedMeta = JSON.parse(raw)
    } catch (e) {
      // ignore parse errors
    }

    // Create submission data
    const submission = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      stravaActivity: stravaActivity.trim(),
      distance: distanceNum,
      duration: duration.trim(),
      submissionDate: new Date().toISOString(),
      status: 'submitted',
      verificationStatus: 'pending',
      proofFileName: proofFile.name,
      notes: 'Awaiting verification',
      activity_name: scrapedMeta?.activity_name || null,
      location: scrapedMeta?.location || null,
      activity_date: scrapedMeta?.date || null,
      pace: scrapedMeta?.pace || null,
      authenticated: scrapedMeta?.authenticated || false,
      auth_valid: scrapedMeta?.auth_valid || false,
    };

    console.log('New submission created:', submission);

    // Upload proof image to Google Drive and get a public URL. If upload fails (including OAuth fallback),
    // DO NOT write to the Google Sheet. Return an error to the client instead.
    let proofUrl = '';
    let uploadSucceeded = false;
    try {
      console.log('Uploading proof image to Google Drive...');
      const drive = await getGoogleDriveClient();

      // read file data from the form file (File from fetch() is a Blob-like object)
      const arrayBuffer = await proofFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Convert buffer to a readable stream for Drive upload
      const stream = Readable.from(buffer);

      const userIdForFile = sanitizeForFilename(submission.email || submission.name);
      const fileMetadata = {
        name: `wrp-proof-${userIdForFile}-${submission.id}-${Date.now()}`,
        parents: [DRIVE_UPLOAD_FOLDER_ID]
      };

      const media = {
        mimeType: proofFile.type || 'image/jpeg',
        body: stream
      };

      let uploadRes;
      try {
        // When using Shared Drives, set supportsAllDrives and driveId
        const createParams = {
          requestBody: fileMetadata,
          media,
          fields: 'id,webViewLink,webContentLink',
          supportsAllDrives: true
        };
        if (DRIVE_SHARED_DRIVE_ID) {
          createParams.driveId = DRIVE_SHARED_DRIVE_ID;
          createParams.corpora = 'drive';
        }

        uploadRes = await drive.files.create(createParams);
        uploadSucceeded = true;
      } catch (uploadErr) {
        console.error('Drive upload failed:', uploadErr?.message || uploadErr);
        // If it's a quota / service account storage error, provide clearer guidance
        const errMsg = String(uploadErr?.message || uploadErr || '');
        if (errMsg.includes('Service Accounts do not have storage quota') || errMsg.includes('Service account does not have storage quota')) {
          // Try to determine the service account email from available sources
          let saEmail = null;
          try {
            // 1) Try auth client credential extraction
            const authClient = drive._options?.auth;
            const tokenInfo = authClient && authClient.getCredentials ? await authClient.getCredentials() : null;
            saEmail = tokenInfo?.client_email || tokenInfo?.clientEmail || null;
          } catch (e) {
            // ignore
          }

          // 2) If not found, try environment variable GOOGLE_SERVICE_ACCOUNT_KEY
          if (!saEmail && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            try {
              const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
              saEmail = parsed.client_email || parsed.clientEmail || saEmail;
            } catch (e) {
              // ignore parse errors
            }
          }

          // 3) If still not found, try reading local credentials.json file in repo root
          if (!saEmail) {
            try {
              // eslint-disable-next-line no-undef
              const fs = await import('fs');
              const path = await import('path');
              const repoRoot = path.resolve(process.cwd());
              const credPath = path.join(repoRoot, 'credentials.json');
              if (fs.existsSync(credPath)) {
                const raw = fs.readFileSync(credPath, 'utf8');
                try {
                  const parsed = JSON.parse(raw);
                  saEmail = parsed.client_email || parsed.clientEmail || saEmail;
                } catch (e) {
                  // ignore
                }
              }
            } catch (e) {
              // ignore
            }
          }

          console.warn('Drive quota error encountered for service account:', saEmail || '<unknown>');

          // Attempt OAuth2 fallback if credentials are available
          if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET && OAUTH_REFRESH_TOKEN) {
            try {
              console.log('Attempting OAuth2 fallback for Drive upload using refresh token...');
              const { google: googleOAuth } = await import('googleapis');
              const { OAuth2 } = googleOAuth.auth;
              const oauth2Client = new OAuth2(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI);
              oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });

              // Create a Drive client with OAuth2 credentials
              const oauthDrive = google.drive({ version: 'v3', auth: oauth2Client });

              // Prepare params for upload via OAuth client
              // NOTE: the original `media.body` stream may have been consumed by the previous upload attempt.
              // Create a fresh stream from the buffer to avoid "stream.push() after EOF" errors.
              const oauthStream = Readable.from(buffer);
              const oauthMedia = {
                mimeType: proofFile.type || 'image/jpeg',
                body: oauthStream
              };
              const oauthCreateParams = {
                requestBody: fileMetadata,
                media: oauthMedia,
                fields: 'id,webViewLink,webContentLink',
                supportsAllDrives: true
              };
              if (DRIVE_SHARED_DRIVE_ID) {
                oauthCreateParams.driveId = DRIVE_SHARED_DRIVE_ID;
                oauthCreateParams.corpora = 'drive';
              }

              const oauthUploadRes = await oauthDrive.files.create(oauthCreateParams);
              const oauthFileId = oauthUploadRes.data.id;
              uploadSucceeded = true;
              // Try to make the file public
              try {
                await oauthDrive.permissions.create({ fileId: oauthFileId, requestBody: { role: 'reader', type: 'anyone' }, supportsAllDrives: true });
              } catch (permErr) {
                console.warn('Could not set public permission via OAuth Drive client:', permErr?.message || permErr);
              }

              const oauthUrl = oauthUploadRes.data.webViewLink || oauthUploadRes.data.webContentLink || `https://drive.google.com/uc?export=view&id=${oauthFileId}`;
              submission.proofFileName = oauthUrl;
              console.log('OAuth fallback upload succeeded, url:', oauthUrl);
            } catch (oauthErr) {
              console.error('OAuth fallback failed:', oauthErr?.message || oauthErr);
              // Upload still failed; will fall through and respond with error
            }
          }

          // If we reach here and uploadSucceeded is still false, return a 503 and DO NOT store to Sheets
          if (!uploadSucceeded) {
            console.warn('Drive upload could not be completed; aborting and not storing submission to Google Sheets.');
            return NextResponse.json(
              {
                error: 'Drive upload blocked by service account storage/quota policy',
                message: 'Submission not saved because the proof file could not be uploaded to Drive. Share the Drive folder with the service account or use a Shared Drive, or configure OAuth fallback.',
                driveFolder: DRIVE_UPLOAD_FOLDER_ID ? `https://drive.google.com/drive/folders/${DRIVE_UPLOAD_FOLDER_ID}` : null,
                serviceAccountEmail: saEmail || null,
                driveClientId: DRIVE_CLIENT_ID || null
              },
              { status: 503 }
            );
          }
        }

        // For other upload errors, rethrow to outer catch
        throw uploadErr;
      }

      const fileId = uploadRes?.data?.id;

      // Make file publicly readable
      try {
        if (fileId) {
          const permParams = {
            fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone'
            }
          };
          // When working with Shared Drives, ensure supportsAllDrives is set
          permParams.supportsAllDrives = true;
          await drive.permissions.create(permParams);
        }
      } catch (permErr) {
        console.warn('Could not set public permission on Drive file:', permErr.message || permErr);
      }

      // Compose a usable URL (prefer webViewLink if available)
      proofUrl = uploadRes?.data?.webViewLink || uploadRes?.data?.webContentLink || (fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : '');
      if (proofUrl) submission.proofFileName = proofUrl;
      console.log('Proof uploaded, url:', proofUrl);
    } catch (driveError) {
      console.error('Failed to upload proof to Google Drive:', driveError);
      // If any unexpected drive error happens and upload didn't succeed, abort without writing to sheet
      if (!uploadSucceeded) {
        console.warn('Aborting submission because Drive upload failed and no fallback succeeded.');
        return NextResponse.json(
          { error: 'Failed to upload proof to Google Drive', details: String(driveError?.message || driveError) },
          { status: 503 }
        );
      }
      // Otherwise continue; submission.proofFileName may be set by OAuth fallback above
    }

    // Store submission in Google Sheets
    console.log('Storing submission in Google Sheets...');
    try {
      const sheetsResult = await storeSubmissionInGoogleSheets(submission);
      if (!sheetsResult.success) {
        console.error('Failed to store submission in Google Sheets:', sheetsResult.message);
        return NextResponse.json(
          { error: 'Failed to store submission data' },
          { status: 500 }
        );
      }
      console.log('Google Sheet updated successfully');
    } catch (googleError) {
      console.error('Failed to update Google Sheet:', googleError);
      return NextResponse.json(
        { error: 'Failed to store submission data' },
        { status: 500 }
      );
    }

    console.log('Submission process completed successfully, returning response...');
    return NextResponse.json({
      success: true,
      message: 'Submission successful',
      submissionId: submission.id,
      distance: submission.distance,
      duration: submission.duration,
      data: {
        name: submission.name,
        email: submission.email,
        submissionDate: submission.submissionDate,
        status: submission.status,
        verificationStatus: submission.verificationStatus
      }
    });

  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/run/submit
 * Get all submissions from Google Sheets (admin only)
 */
export async function GET(request) {
  try {
    console.log('Fetching submissions from Google Sheets...');
    // If caller asks for whoami, return service account email and drive client id to help troubleshooting
    try {
      const reqUrl = new URL(request.url);
      if (reqUrl.searchParams.get('whoami') === '1') {
        const sa = await getServiceAccountEmail();
        return NextResponse.json({ serviceAccountEmail: sa || null, driveClientId: DRIVE_CLIENT_ID || null });
      }
    } catch (e) {
      // ignore whoami parsing errors
    }
    
    // Get submissions from Google Sheets
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SUBMISSIONS_SHEET_NAME}!A2:H1000`, // Skip header row, get up to 1000 rows for A:H
    });

    const rows = response.data.values || [];
    console.log(`Found ${rows.length} submissions in Google Sheets`);

    // Convert rows back to submission objects
    const submissions = rows.map(row => ({
      timestamp: row[0] || '',
      name: row[1] || '',
      email: row[2] || '',
      phone: row[3] || '',
      stravaActivity: row[4] || '',
      distance: parseFloat(row[5]) || 0,
      duration: row[6] || '',
      proofFileName: row[7] || ''
    })).filter(row => row.timestamp); // Filter out empty rows by timestamp

    // Return summary without sensitive data
    const summary = submissions.map(sub => ({
      timestamp: sub.timestamp,
      name: sub.name,
      distance: sub.distance,
      duration: sub.duration
    }));

    return NextResponse.json({
      submissions: summary,
      total: submissions.length,
      stats: {
        totalDistance: submissions.reduce((sum, s) => sum + (s.distance || 0), 0)
      }
    });

  } catch (error) {
    console.error('Error fetching submissions from Google Sheets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
