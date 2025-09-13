import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
const SUBMISSIONS_SHEET_NAME = process.env.GOOGLE_SUBMISSIONS_SHEET_NAME || 'WRP_run_submissions';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getGoogleSheetsClient() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
  } catch (err) {
    console.error('Error creating Sheets client:', err);
    throw err;
  }
}

function parseDurationToSeconds(hms) {
  if (!hms) return 0;
  const parts = String(hms).split(':').map(p => parseInt(p || '0', 10));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) return parts[0] || 0;
  return 0;
}

function formatSecondsToHms(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export async function GET(request) {
  try {
    const sheets = await getGoogleSheetsClient();
    const range = `${SUBMISSIONS_SHEET_NAME}!A2:I1000`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];

    // Columns: A=Date Submit, B=Nama Lengkap, C=Email, D=Handphone, E=Link Strava, F=Jarak, G=Durasi, H=Foto, I=Verified
    const users = {};

    for (const row of rows) {
      const name = (row[1] || '').trim();
      const email = (row[2] || '').trim().toLowerCase();
      const distance = parseFloat(row[5]) || 0;
      const duration = row[6] || '';
      const verified = String(row[8] || '').toLowerCase().includes('verified');

      if (!verified) continue; // only include verified submissions
      if (!name || !email) continue;

      const key = `${name}::${email}`;
      if (!users[key]) users[key] = { name, email, totalDistance: 0, totalSeconds: 0, submissions: 0 };

      if (users[key].submissions < 4) {
        users[key].totalDistance += distance;
        users[key].totalSeconds += parseDurationToSeconds(duration);
        users[key].submissions += 1;
      }
    }

    const leaderboard = Object.values(users).map(u => ({
      name: u.name,
      email: u.email,
      submissions: u.submissions,
      totalDistance: Number(u.totalDistance.toFixed(2)),
      totalDuration: formatSecondsToHms(u.totalSeconds)
    }));

    // sort by totalDistance desc then totalSeconds asc
    leaderboard.sort((a, b) => {
      if (b.totalDistance !== a.totalDistance) return b.totalDistance - a.totalDistance;
      return parseDurationToSeconds(a.totalDuration) - parseDurationToSeconds(b.totalDuration);
    });

    const url = new URL(request.url);
    const wantIframe = url.searchParams.get('view') === 'iframe' || request.headers.get('accept')?.includes('text/html');

    if (wantIframe) {
      // simple HTML table for iframe embedding
      const rowsHtml = leaderboard.map((u, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>${u.submissions} x</td>
          <td>${u.totalDistance}</td>
          <td>${u.totalDuration}</td>
        </tr>
      `).join('');

      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>We Run Palestina - Leaderboard</title>
            <style>
              :root{--accent:#16a34a;--dark:#000;--muted:#6b7280;--bg:#f8faf9;--card:#ffffff;--border:#e6e6e6}
              html,body{height:100%;margin:0;padding:0;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a}
              .container{max-width:980px;margin:18px auto;padding:0;background:var(--card);border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(2,6,23,0.08)}
              .header{display:flex;align-items:center;gap:12px;padding:18px 20px;background:var(--dark);color:#fff}
              .logo{font-weight:700;font-size:16px}
              .sub{margin-left:auto;font-size:13px;color:rgba(255,255,255,0.85)}
              .table-wrap{padding:12px 18px}
              table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
              thead th{background:var(--dark);color:#fff;padding:12px 10px;text-align:left;font-weight:600}
              tbody tr:nth-child(odd){background:transparent}
              td{padding:10px;border-top:1px solid var(--border);vertical-align:middle}
              .rank{width:48px;text-align:center;font-weight:700;color:var(--muted)}
              .name{font-weight:600;color:#0b1220}
              .email{color:var(--muted);font-size:13px}
              .distance{color:var(--accent);font-weight:700}
              .duration{color:#0b1220}
              @media (max-width:720px){
                .container{margin:8px}
                thead th:nth-child(3), td:nth-child(3){display:none}
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">WE RUN PALESTINA</div>
                <div class="sub">Leaderboard - Verified Results</div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Nama</th><th>Email</th><th>Subm</th><th>Jarak (km)</th><th>Durasi</th></tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </body>
        </html>`;
      return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    return NextResponse.json({ total: leaderboard.length, leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
