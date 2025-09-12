import { NextResponse } from 'next/server';
import { getClubActivitiesWithFallback, formatDistance, formatTime, filterActivitiesByDateRange, calculatePace, dedupeActivities } from '../../../../lib/strava';
import { getGoogleSheetsClientFromEnv } from '../../../../lib/sheets-client';
import { STRAVA_CONFIG, CLUB_CONFIG } from '../../../../lib/config';

// Spreadsheet ID extracted from the user-provided URL
const SPREADSHEET_ID = '1g1G-s6FcZ7Tz0qZCeuragWVTFWt1_rU0L-LZ6k-HskE';
const SHEET_NAME = 'Recap';

// Protect this endpoint with a cron secret header
const CRON_SECRET = process.env.CRON_SECRET || '8s7K4f9VqR2xN6mYwZbP0hQ3tL5uE1c';

/**
 * Compute recap metrics from activities array
 */
function computeRecap(activities) {
  // We'll compute a global recap but mainly rely on per-athlete recap elsewhere.
  const totalActivities = activities.length;
  const totalDistanceMeters = activities.reduce((s, a) => s + (Number(a.distance) || 0), 0);
  const totalMovingTimeSeconds = activities.reduce((s, a) => s + (Number(a.moving_time) || 0), 0);
  const totalElevation = activities.reduce((s, a) => s + (Number(a.total_elevation_gain) || 0), 0);
  const uniqueAthletes = new Set(activities.map(a => (a.athlete && (a.athlete.firstname + ' ' + a.athlete.lastname)) || a.athlete?.id || a.id)).size;

  return {
    date: new Date().toISOString(),
    total_activities: totalActivities,
    total_distance_km: (totalDistanceMeters / 1000).toFixed(2),
    total_moving_time_hms: formatTime(totalMovingTimeSeconds),
    total_elevation_gain: Number(totalElevation.toFixed ? totalElevation.toFixed(2) : totalElevation),
    unique_athletes: uniqueAthletes,
  };
}

export async function GET(request) {
  try {
    const secret = request.headers.get('x-cron-secret');
    if (!secret || secret !== CRON_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

  // (No date filtering) — compute recap from all activities returned by the Strava API

    // Strava token is required — do not fall back to local club.json
    const stravaToken = process.env.STATIC_BEARER_TOKEN || null;
    if (!stravaToken) {
      return NextResponse.json({ ok: false, error: 'Missing STRAVA_ACCESS_TOKEN environment variable; this endpoint requires a valid Strava access token and will not use local club.json fallback.' }, { status: 400 });
    }

    const clubId = process.env.STRAVA_CLUB_ID || CLUB_CONFIG.DEFAULT_CLUB_ID;

    // useLocal = false to force API-only behavior
    const activities = await getClubActivitiesWithFallback(clubId, stravaToken, false);

    const recap = computeRecap(activities);

    // Build deduped activity rows (no aggregation)
    const runs = activities.filter(a => (a && (a.type === 'Run' || a.sport_type === 'Run')));

    // Group by athlete and dedupe within athlete
    const rowsToAppend = [];
    const athleteMap = new Map();
    for (const a of runs) {
      const athleteName = a.athlete ? `${(a.athlete.firstname||'').trim()} ${(a.athlete.lastname||'').trim()}`.trim() : (a.athlete?.id || 'unknown');
      if (!athleteMap.has(athleteName)) athleteMap.set(athleteName, []);
      athleteMap.get(athleteName).push(a);
    }

    for (const [athleteName, acts] of athleteMap.entries()) {
      // Use shared dedupe helper which rounds distance and computes pace in key
      const uniqueActs = dedupeActivities(acts);
      for (const act of uniqueActs) {
        const pace = calculatePace(Number(act.distance)||0, Number(act.moving_time)||Number(act.elapsed_time)||0);
        const movingSec = Number(act.moving_time)||0;
        const elapsedSec = Number(act.elapsed_time)||0;
        const movingHours = (movingSec/3600);
        const elapsedHours = (elapsedSec/3600);

        // Round to 2 decimals to avoid long floating output
        const movingHoursRounded = Number(movingHours.toFixed(2));
        const elapsedHoursRounded = Number(elapsedHours.toFixed(2));

        rowsToAppend.push([
          new Date().toISOString(),
          athleteName,
          act.id || '',
          act.name || '',
          ((Number(act.distance)||0)/1000).toFixed(2),
          formatTime(movingSec),
          formatTime(elapsedSec),
          movingHoursRounded,
          elapsedHoursRounded,
          Number(act.total_elevation_gain)||0,
          act.type || act.sport_type || '',
          pace
        ]);
      }
    }

    // Try to append deduped activity rows to Google Sheet if credentials available
    try {
      const { sheets } = await getGoogleSheetsClientFromEnv();
      const readRange = `${SHEET_NAME}`; // read whole sheet
      // Check for cleanup query param
      const url = new URL(request.url);
      const doCleanup = url.searchParams.get('cleanup') === '1';

      // Read existing rows to avoid inserting duplicates
      let existing = [];
      try {
        const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: readRange });
        existing = getRes.data.values || [];
      } catch (err) {
        // If reading fails, proceed with append but warn later
        existing = [];
      }

      // Normalize existing rows in-place: ensure moving_time/elapsed_time are HH:MM:SS strings
      // and moving_hours/elapsed_hours are rounded numbers (2 decimals). We'll batch update changed rows.
      const batchUpdates = [];
      for (let i = 0; i < existing.length; i++) {
        const r = existing[i];
        // columns mapping: 0=date,1=athlete,2=id,3=name,4=dist,5=moving_hms,6=elapsed_hms,7=moving_hours,8=elapsed_hours
        const rowIndex = i + 1; // sheet rows are 1-indexed

        const raw_m_hms = (r[5] || '').toString().trim();
        const raw_e_hms = (r[6] || '').toString().trim();
        const raw_m_hours = (r[7] !== undefined ? r[7] : '').toString().trim();
        const raw_e_hours = (r[8] !== undefined ? r[8] : '').toString().trim();

        // helper to convert decimal hours to HH:MM:SS
        const toHmsFromDecimal = (s) => {
          const n = Number(s);
          if (isNaN(n)) return '';
          const secs = Math.round(n * 3600);
          return formatTime(secs);
        };

        // normalize hours fields to 2 decimals (as string/number)
        const norm_m_hours = (raw_m_hours && !raw_m_hours.includes(':')) ? Number(Number(raw_m_hours).toFixed(2)) : (raw_m_hours || '');
        const norm_e_hours = (raw_e_hours && !raw_e_hours.includes(':')) ? Number(Number(raw_e_hours).toFixed(2)) : (raw_e_hours || '');

        // normalize HH:MM:SS fields: if they are decimal numbers or empty, try to derive from hours
        let norm_m_hms = raw_m_hms;
        let norm_e_hms = raw_e_hms;
        if (!norm_m_hms || !norm_m_hms.includes(':')) {
          if (raw_m_hms && !isNaN(Number(raw_m_hms))) {
            norm_m_hms = toHmsFromDecimal(raw_m_hms);
          } else if (norm_m_hours && !isNaN(Number(norm_m_hours))) {
            norm_m_hms = toHmsFromDecimal(norm_m_hours);
          }
        }
        if (!norm_e_hms || !norm_e_hms.includes(':')) {
          if (raw_e_hms && !isNaN(Number(raw_e_hms))) {
            norm_e_hms = toHmsFromDecimal(raw_e_hms);
          } else if (norm_e_hours && !isNaN(Number(norm_e_hours))) {
            norm_e_hms = toHmsFromDecimal(norm_e_hours);
          }
        }

        // If any normalized values differ from original, schedule an update for columns F:I
        const changed = (String(norm_m_hms) !== raw_m_hms) || (String(norm_e_hms) !== raw_e_hms) || (String(norm_m_hours) !== raw_m_hours) || (String(norm_e_hours) !== raw_e_hours);
        if (changed) {
          // Prepare values for F (col6) to I (col9)
          const values = [[norm_m_hms || '', norm_e_hms || '', (norm_m_hours !== '' ? norm_m_hours : ''), (norm_e_hours !== '' ? norm_e_hours : '')]];
          const startCol = 'F';
          const endCol = 'I';
          const range = `${SHEET_NAME}!${startCol}${rowIndex}:${endCol}${rowIndex}`;
          batchUpdates.push({ range, values });
          // Update local existing array so duplicate-detection uses normalized values
          existing[i][5] = norm_m_hms || '';
          existing[i][6] = norm_e_hms || '';
          existing[i][7] = norm_m_hours !== '' ? String(norm_m_hours) : '';
          existing[i][8] = norm_e_hours !== '' ? String(norm_e_hours) : '';
        }
      }

      if (batchUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: batchUpdates
          }
        });
      }
      const existingKeys = new Set();

      // parse time-like field to seconds; supports HH:MM:SS, MM:SS, decimal hours, or numeric seconds
      function parseTimeToSeconds(s) {
        if (s === undefined || s === null || s === '') return 0;
        const str = s.toString().trim();
        if (!str) return 0;
        if (str.includes(':')) {
          const parts = str.split(':').map(p => Number(p));
          if (parts.length === 3 && parts.every(p => !isNaN(p))) return Math.round(parts[0]*3600 + parts[1]*60 + parts[2]);
          if (parts.length === 2 && parts.every(p => !isNaN(p))) return Math.round(parts[0]*60 + parts[1]);
          return 0;
        }
        const n = Number(str);
        if (isNaN(n)) return 0;
        // If value looks like small decimal (<24), treat as hours -> convert to seconds
        if (n > 0 && n < 24) return Math.round(n * 3600);
        // Otherwise treat as seconds already
        return Math.round(n);
      }

  for (const r of existing) {
        const id = (r[2] || '').toString().trim();
        if (id) existingKeys.add(`id:${id}`);

        const athlete = (r[1] || '').toString().trim();
        const name = (r[3] || '').toString().trim();
        // Normalize distance to two decimals (km)
        const distVal = (r[4] || '').toString().trim();
        const dist = (() => { const n = Number(distVal); return isNaN(n) ? distVal : n.toFixed(2); })();

  // Build two variants of seconds keys so mixed formats match:
  const m_secs_hms = parseTimeToSeconds(r[5] || '');
  const e_secs_hms = parseTimeToSeconds(r[6] || '');
  const m_secs_hours = parseTimeToSeconds(r[7] || '');
  const e_secs_hours = parseTimeToSeconds(r[8] || '');

  existingKeys.add(`k_hms:${athlete}||${name}||${dist}||${m_secs_hms}||${e_secs_hms}`);
  existingKeys.add(`k_hours:${athlete}||${name}||${dist}||${m_secs_hours}||${e_secs_hours}`);
      }

      // If cleanup mode requested, find duplicate rows (keep first) and delete them
      let deletedCount = 0;
      let deletionRequests = [];
      if (doCleanup && existing.length > 0) {
        const seen = new Set();
        // iterate rows with sheet index (1-based)
        for (let i = 0; i < existing.length; i++) {
          const r = existing[i];
          const athlete = (r[1] || '').toString().trim();
          const name = (r[3] || '').toString().trim();
          const distVal = (r[4] || '').toString().trim();
          const distKey = (() => { const n = Number(distVal); return isNaN(n) ? distVal : Number(n).toFixed(2); })();
          const m_secs = parseTimeToSeconds(r[5] || r[7] || '');
          const e_secs = parseTimeToSeconds(r[6] || r[8] || '');
          const key = `k_sec:${athlete}||${name}||${distKey}||${m_secs}||${e_secs}`;
          if (seen.has(key)) {
            // Delete this row; need sheetId and 0-indexed row index for DeleteDimension
            // We'll request deletion of the single row at index i (0-based)
            deletionRequests.push({ range: { sheetId: 0, dimension: 'ROWS', startIndex: i, endIndex: i+1 } });
            deletedCount++;
          } else {
            seen.add(key);
          }
        }

        if (deletionRequests.length > 0) {
          // Need the sheetId; fetch spreadsheet metadata to map sheet name -> sheetId
          const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
          const sheet = (meta.data.sheets || []).find(s => s.properties && s.properties.title === SHEET_NAME);
          const sheetId = sheet ? sheet.properties.sheetId : null;
          if (sheetId === null) {
            // can't delete without sheetId; will return counts but not perform deletion
            deletionRequests = [];
          } else {
            // convert our ranges to DeleteDimension requests with correct sheetId
            const requests = deletionRequests.map(d => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: d.range.startIndex, endIndex: d.range.endIndex } } }));
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
            // After deletion, reading again would be needed for perfect sync, but we report deletedCount
          }
        }
      }

      const newRows = [];
      let skippedCount = 0;
      for (const row of rowsToAppend) {
        const id = (row[2] || '').toString().trim();
        if (id && existingKeys.has(`id:${id}`)) {
          skippedCount++;
          continue;
        }

        const athlete = (row[1]||'').toString().trim();
        const name = (row[3]||'').toString().trim();
        const distVal = (row[4]||'').toString().trim();
        const dist = (() => { const n = Number(distVal); return isNaN(n) ? distVal : n; })();
        const m_secs_hms = parseTimeToSeconds(row[5] || '');
        const e_secs_hms = parseTimeToSeconds(row[6] || '');
        const m_secs_hours = parseTimeToSeconds(row[7] || '');
        const e_secs_hours = parseTimeToSeconds(row[8] || '');

        const key_hms = `k_hms:${athlete}||${name}||${Number(dist).toFixed ? Number(dist).toFixed(2) : dist}||${m_secs_hms}||${e_secs_hms}`;
        const key_hours = `k_hours:${athlete}||${name}||${Number(dist).toFixed ? Number(dist).toFixed(2) : dist}||${m_secs_hours}||${e_secs_hours}`;

        if (existingKeys.has(key_hms) || existingKeys.has(key_hours)) {
          skippedCount++;
          continue;
        }

        existingKeys.add(key_hms);
        existingKeys.add(key_hours);
        newRows.push(row);
      }

      if (newRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: newRows }
        });
      }

  const responseBody = { ok: true, recap, rows: rowsToAppend, appended_count: newRows.length, skipped_count: skippedCount };
  if (doCleanup) responseBody.deleted_count = deletedCount;
  return NextResponse.json(responseBody);
    } catch (sheetErr) {
      return NextResponse.json({ ok: true, recap, rows: rowsToAppend, warning: `Failed to append to sheet: ${sheetErr.message}` });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}

// Use the default Node.js server runtime so we can access process.env and Google APIs
