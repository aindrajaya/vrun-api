import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Google Sheets API configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'WRP_Registrations';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_API_URL = process.env.MIDTRANS_API_URL || 'https://api.sandbox.midtrans.com';

/**
 * Creates a dynamic payment link using Midtrans API
 * @param {Object} registrationData - Registration data
 * @param {number} totalAmount - Total amount including donation
 * @returns {Promise<Object>} - Object containing payment link URL and order ID
 */
async function createMidtransPaymentLink(registrationData, totalAmount = 180000) {
  // Validate and sanitize inputs
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    console.error('Invalid totalAmount provided:', totalAmount);
    totalAmount = 180000; // Default fallback
  }

  if (!MIDTRANS_SERVER_KEY) {
    console.warn('Midtrans server key not configured, using static payment link');
    return {
      paymentUrl: process.env.MIDTRANS_PAYMENT_LINK || 'https://app.midtrans.com/payment-links/ydsf-run',
      orderId: null
    };
  }

  try {
    console.log('Creating Midtrans payment link for:', {
      name: registrationData.name,
      email: registrationData.email,
      totalAmount: totalAmount,
      totalAmountType: typeof totalAmount
    });

    const orderIdSuffix = Date.now().toString();
    const paymentLinkId = `wrp-${registrationData.id}-${orderIdSuffix}`;
    const orderId = `WRP-${registrationData.id}-${orderIdSuffix}`;
    
    // Split name into first and last name
    const nameParts = registrationData.name.trim().split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Validate required fields for Midtrans
    if (!registrationData.email || !registrationData.phone || !registrationData.name) {
      console.error('Missing required fields for Midtrans payment link');
      return {
        paymentUrl: process.env.MIDTRANS_PAYMENT_LINK || 'https://app.sandbox.midtrans.com/payment-links/ydsf-run',
        orderId: null
      };
    }

    // Ensure phone number is in correct format
    let phoneNumber = registrationData.phone.replace(/\D/g, ''); // Remove non-digits
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '62' + phoneNumber.substring(1); // Convert to international format
    } else if (!phoneNumber.startsWith('62')) {
      phoneNumber = '62' + phoneNumber;
    }

    // Ensure totalAmount is a valid number
    const validTotalAmount = Math.max(parseInt(totalAmount) || 180000, 180000);
    
    console.log('Payment data validation:', {
      originalTotalAmount: totalAmount,
      validTotalAmount: validTotalAmount,
      registrationId: registrationData.id,
      paymentLinkId: paymentLinkId,
      orderId: orderId
    });

    // Midtrans Payment Links API format
    const paymentData = {
      transaction_details: {
        order_id: orderId,
        gross_amount: validTotalAmount
      },
      credit_card: {
        secure: true
      },
      customer_details: {
        first_name: firstName,
        last_name: lastName,
        email: registrationData.email,
        phone: phoneNumber
      },
      item_details: [
        {
          id: "wrp-registration",
          name: "WRP - Biaya Pendaftaran",
          price: 180000,
          quantity: 1
        }
      ],
      callbacks: {
        finish: process.env.PAYMENT_SUCCESS_URL || 'https://werunpalestina.framer.website/',
        error: process.env.PAYMENT_ERROR_URL || 'https://werunpalestina.framer.website/register?error=payment_failed',
        pending: process.env.PAYMENT_PENDING_URL || 'https://werunpalestina.framer.website/register?status=pending'
      },
      expiry: {
        duration: 24,
        unit: "hours"
      },
      page_expiry: {
        duration: 10,
        unit: "minutes"
      }
    };

    // Add donation item if validTotalAmount > 180000
    if (validTotalAmount > 180000) {
      const donationAmount = validTotalAmount - 180000;
      paymentData.item_details.push({
        id: "wrp-donation",
        name: "Donasi untuk Palestina",
        price: donationAmount,
        quantity: 1
      });
    }

    // Final validation before sending to Midtrans
    if (!paymentData.transaction_details?.gross_amount || !paymentData.transaction_details?.order_id) {
      console.error('Critical payment data missing:', {
        gross_amount: paymentData.transaction_details?.gross_amount,
        order_id: paymentData.transaction_details?.order_id,
        transaction_details: paymentData.transaction_details
      });
      throw new Error('Critical payment data is missing');
    }

    // Create auth header
    const authString = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64');
    
    // Use Midtrans Payment Links API
    console.log('Sending request to Midtrans Payment Links API:', {
      url: `${MIDTRANS_API_URL}/v1/payment-links`,
      paymentData: JSON.stringify(paymentData, null, 2)
    });
    
    const response = await fetch(`${MIDTRANS_API_URL}/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: JSON.stringify(paymentData),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const result = await response.json();
    
    console.log('Midtrans API response:', {
      status: response.status,
      statusText: response.statusText,
      result: result
    });

    if (response.ok && result.payment_url) {
      console.log('Midtrans payment link created successfully:', result.payment_url);
      return {
        paymentUrl: result.payment_url,
        orderId: orderId
      };
    } else {
      console.error('Failed to create Midtrans payment link:', {
        status: response.status,
        statusText: response.statusText,
        error: result
      });
      
      // Fallback to static link
      return {
        paymentUrl: process.env.MIDTRANS_PAYMENT_LINK || 'https://app.sandbox.midtrans.com/payment-links/ydsf-run',
        orderId: null
      };
    }

  } catch (error) {
    console.error('Error creating Midtrans payment link:', error);
    
    // Final fallback - just use static payment link
    console.log('Using static payment link as final fallback');
    return {
      paymentUrl: process.env.MIDTRANS_PAYMENT_LINK || 'https://app.sandbox.midtrans.com/payment-links/ydsf-run',
      orderId: null
    };
  }
}

/**
 * Checks if an email already exists in Google Sheets
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} - True if email exists, false otherwise
 */
async function checkDuplicateEmail(email) {
  try {
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!D:D`, // Column D contains emails
    });

    const existingEmails = response.data.values ? response.data.values.flat().map(e => e.toLowerCase()) : [];
    return existingEmails.includes(email.toLowerCase());
  } catch (error) {
    console.error('Error checking duplicate email:', error);
    return false; // If check fails, allow registration to proceed
  }
}

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
 * Stores registration data in Google Sheets
 * @param {Object} registrationData - Registration object to store
 * @returns {Promise<Object>} - Google Sheets API response
 */
async function storeRegistrationInGoogleSheets(registrationData) {
    if (!registrationData) {
        console.warn('No registration data to store in Google Sheets');
        return { success: false, message: 'No registration data provided' };
    }

    try {
        console.log('Storing registration in Google Sheets:', registrationData);
        
        // Prepare the data for Google Sheets format
        const columnOrder = [
            'timestamp',
            'id',
            'name',
            'email',
            'phone',
            'stravaName',
            'registrationDate',
            'status',
            'paymentStatus',
            'donationAmount',
            'totalAmount',
            'donationDate',
            'paymentLink',
            'midtransOrderId'
        ];

        // Convert registration object to array based on column order
        const dataToAppend = [columnOrder.map(key => {
            if(key === 'timestamp') {
                return new Date().toISOString(); // Add current timestamp
            }
            if(key === 'totalAmount') {
                return (registrationData.donationAmount || 0) + 180000; // Base amount + donation
            }
            return registrationData[key] !== undefined ? registrationData[key] : '';
        })];

        // Get the Google Sheets client
        const sheets = await getGoogleSheetsClient();
        
        // Check if sheet exists and create headers if needed
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A1:N1`,
            });

            // If sheet is empty, add headers
            if (!response.data.values || response.data.values.length === 0) {
                console.log('Adding headers to sheet');
                const headers = [
                    'Timestamp',
                    'Registration ID', 
                    'Name',
                    'Email',
                    'Phone',
                    'Strava Name',
                    'Registration Date',
                    'Status',
                    'Payment Status',
                    'Donation Amount',
                    'Total Amount', 
                    'Donation Date',
                    'Payment Link',
                    'Midtrans Order ID'
                ];

                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A1:N1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [headers],
                    },
                });
            }
        } catch (headerError) {
            console.log('Sheet might not exist or header check failed, continuing with data append');
        }

        // Check for duplicate registration ID
        try {
            const idRange = `${SHEET_NAME}!B:B`; // Column B contains registration IDs
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: idRange,
            });

            const existingIds = response.data.values ? response.data.values.flat() : [];
            if (existingIds.includes(registrationData.id)) {
                console.log(`Registration ID ${registrationData.id} already exists in sheet`);
                return { 
                    success: false, 
                    message: 'Registration ID already exists in Google Sheets' 
                };
            }
        } catch (checkError) {
            console.log('Could not check for duplicates, proceeding with append');
        }

        // Append the registration data
        const appendRange = `${SHEET_NAME}!A2`; // Start appending from row 2, keep row 1 as headers
        const result = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: appendRange,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: dataToAppend,
            },
        });

        console.log('Google Sheets storage successful:', result.data);
        return { 
            success: true, 
            message: 'Registration successfully stored in Google Sheets',
            response: result.data 
        };
    } catch (error) {
        console.error('Error storing registration in Google Sheets:', error.message);
        console.error('Error details:', error.response?.data || error);
        return { 
            success: false, 
            message: 'Failed to store registration in Google Sheets',
            error: error.message
        };
    }
}

/**
 * POST /api/register
 * Handle user registration for We Run Palestina
 */
export async function POST(request) {
  try {
    console.log('=== POST /api/register - Starting registration process ===');
    
    const body = await request.json();
    console.log('Request body received:', body);
    
    const { name, email, phone, stravaName, donationAmount } = body;

    // Validate required fields
    if (!name || !email || !phone || !stravaName) {
      console.log('Validation failed: missing required fields');
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
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

    console.log('Validation passed, creating registration object...');

    // Parse and validate donation amount
    const donation = parseFloat(donationAmount) || 0;
    const totalAmount = 180000 + donation;
    
    console.log('Registration details:', {
      name: name.trim(),
      email: email.trim(),
      donationAmount: donation,
      totalAmount: totalAmount
    });

    // Create registration data
    const registration = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      stravaName: stravaName.trim(),
      registrationDate: new Date().toISOString(),
      status: 'pending',
      paymentStatus: 'unpaid',
      donationAmount: donation,
      donationDate: donation > 0 ? new Date().toISOString() : null,
      paymentLink: null,
      midtransOrderId: null
    };

    // Check for duplicate email in Google Sheets
    console.log('Checking for duplicate email in Google Sheets...');
    try {
      const isDuplicate = await checkDuplicateEmail(registration.email);
      if (isDuplicate) {
        console.log('Duplicate email found in Google Sheets, returning error');
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
    } catch (error) {
      console.error('Error checking for duplicate email:', error);
      // Continue with registration if duplicate check fails
    }

    console.log('New registration saved:', registration);

    // Create dynamic Midtrans payment link with user details including donation
    console.log('Creating Midtrans payment link...');
    const paymentResult = await createMidtransPaymentLink(registration, totalAmount);
    console.log('Midtrans payment result:', paymentResult);
    
    // Update registration with payment link and order ID
    registration.paymentLink = paymentResult.paymentUrl;
    registration.midtransOrderId = paymentResult.orderId;

    // Store registration in Google Sheets with complete payment info
    console.log('Storing registration in Google Sheets...');
    try {
      const sheetsResult = await storeRegistrationInGoogleSheets(registration);
      if (sheetsResult.success) {
        console.log('Google Sheet updated successfully');
      } else {
        console.warn('Google Sheets storage issue:', sheetsResult.message);
      }
    } catch (googleError) {
      console.error('Failed to update Google Sheet:', googleError);
      // Don't fail the registration if Google Sheet update fails
    }

    console.log('Registration process completed successfully, returning response...');
    return NextResponse.json({
      success: true,
      message: 'Registration successful',
      registrationId: registration.id,
      paymentLink: paymentResult.paymentUrl,
      totalAmount: totalAmount,
      donationAmount: donation,
      data: {
        name: registration.name,
        email: registration.email,
        registrationDate: registration.registrationDate,
        paymentAmount: 180000,
        totalAmount: totalAmount,
        donationAmount: donation,
        paymentInstructions: donation > 0 
          ? `Silakan lanjutkan ke link pembayaran untuk menyelesaikan pendaftaran Anda (Rp ${totalAmount.toLocaleString('id-ID')} termasuk donasi).`
          : 'Silakan lanjutkan ke link pembayaran untuk menyelesaikan pendaftaran Anda.'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/register
 * Get all registrations from Google Sheets (admin only)
 */
export async function GET(request) {
  try {
    console.log('Fetching registrations from Google Sheets...');
    
    // Get registrations from Google Sheets
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:N1000`, // Skip header row, get up to 1000 rows
    });

    const rows = response.data.values || [];
    console.log(`Found ${rows.length} registrations in Google Sheets`);

    // Convert rows back to registration objects
    const registrations = rows.map(row => ({
      timestamp: row[0] || '',
      id: row[1] || '',
      name: row[2] || '',
      email: row[3] || '',
      phone: row[4] || '',
      stravaName: row[5] || '',
      registrationDate: row[6] || '',
      status: row[7] || 'pending',
      paymentStatus: row[8] || 'unpaid',
      donationAmount: parseFloat(row[9]) || 0,
      totalAmount: parseFloat(row[10]) || 180000,
      donationDate: row[11] || null,
      paymentLink: row[12] || '',
      midtransOrderId: row[13] || ''
    })).filter(reg => reg.id); // Filter out empty rows

    // Return summary without sensitive data
    const summary = registrations.map(reg => ({
      id: reg.id,
      name: reg.name,
      stravaName: reg.stravaName,
      registrationDate: reg.registrationDate,
      status: reg.status,
      paymentStatus: reg.paymentStatus,
      donationAmount: reg.donationAmount,
      totalAmount: reg.totalAmount
    }));

    return NextResponse.json({
      registrations: summary,
      total: registrations.length,
      stats: {
        pending: registrations.filter(r => r.status === 'pending').length,
        active: registrations.filter(r => r.status === 'active').length,
        paid: registrations.filter(r => r.paymentStatus === 'paid').length,
        unpaid: registrations.filter(r => r.paymentStatus === 'unpaid').length,
        totalDonations: registrations.reduce((sum, r) => sum + (r.donationAmount || 0), 0)
      }
    });

  } catch (error) {
    console.error('Error fetching registrations from Google Sheets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
