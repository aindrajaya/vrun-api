import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Try to build Google Sheets client from environment variable GOOGLE_SERVICE_ACCOUNT_KEY.
 * If not present or invalid, fallback to local credentials.json file at repo root.
 * Also return the service account email as diagnostics.
 */
export async function getGoogleSheetsClientFromEnv() {
  let credentials = null;
  // 1) Try env
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (err) {
      console.warn('Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY, will try credentials.json fallback');
    }
  }

  // 2) Fallback to credentials.json file if present
  if (!credentials) {
    try {
      const credPath = path.resolve(process.cwd(), 'credentials.json');
      if (fs.existsSync(credPath)) {
        const raw = fs.readFileSync(credPath, 'utf8');
        credentials = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed reading local credentials.json fallback:', err.message || err);
    }
  }

  if (!credentials) {
    throw new Error('No Google service account credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY or add credentials.json');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const serviceAccountEmail = credentials.client_email || null;

  return { sheets, serviceAccountEmail };
}

export default { getGoogleSheetsClientFromEnv };
