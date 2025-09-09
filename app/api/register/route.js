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
 *      totalAmount: parseFloat(row[13]) || 120000,
      donationDate: row[14] || '',
      paymentLink: row[15] || '',
      midtransOrderId: row[16] || ''ram {Object} registrationData - Registration data
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
    // If only single name provided, duplicate it for last name to comply with Midtrans API
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Validate required fields for Midtrans
    if (!registrationData.email || !registrationData.phone || !registrationData.name) {
      console.error('Missing required fields for Midtrans payment link');
      return {
        paymentUrl: process.env.MIDTRANS_PAYMENT_LINK || 'https://app.midtrans.com/payment-links/ydsf-run',
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

    // Calculate package amounts
    const packageType = registrationData.packageType || 'basic';
    let baseAmount = 0;
    let fixedDonation = 0;
    let jerseyPrice = 0;
    
    if (packageType === 'basic') {
      baseAmount = 80000;
      fixedDonation = 20000;
      jerseyPrice = 0;
    } else if (packageType === 'basic-jersey') {
      baseAmount = 80000;
      fixedDonation = 20000;
      jerseyPrice = 150000;
    } else if (packageType === 'jersey-only') {
      baseAmount = 0;
      fixedDonation = 0;
      jerseyPrice = 150000;
    }
    
    const additionalDonation = registrationData.additionalDonation || 0;
    
    // Calculate the actual total amount including additional donation
    const actualTotalAmount = baseAmount + fixedDonation + jerseyPrice + additionalDonation;
    const packageTotal = baseAmount + fixedDonation + jerseyPrice;
    
    // Use the actual calculated total, but ensure it's at least the package minimum
    const validTotalAmount = Math.max(actualTotalAmount, packageTotal);
    
    console.log('Payment data validation:', {
      packageType: packageType,
      baseAmount: baseAmount,
      fixedDonation: fixedDonation,
      jerseyPrice: jerseyPrice,
      packageTotal: packageTotal,
      additionalDonation: additionalDonation,
      actualTotalAmount: actualTotalAmount,
      originalTotalAmountParam: totalAmount,
      finalValidTotalAmount: validTotalAmount,
      registrationId: registrationData.id,
      paymentLinkId: paymentLinkId,
      orderId: orderId
    });

    // Build item_details array first
    const itemDetails = [];
    
    // Add base amount if applicable
    if (baseAmount > 0) {
      itemDetails.push({
        id: "wrp-base-amount",
        name: `WRP - Biaya Tetap Paket ${packageType.charAt(0).toUpperCase() + packageType.slice(1)}`,
        price: baseAmount,
        quantity: 1
      });
    }
    
    // Add fixed donation if applicable
    if (fixedDonation > 0) {
      itemDetails.push({
        id: "wrp-fixed-donation",
        name: "Donasi Tetap untuk Palestina",
        price: fixedDonation,
        quantity: 1
      });
    }
    
    // Add jersey price if applicable
    if (jerseyPrice > 0) {
      itemDetails.push({
        id: "wrp-jersey",
        name: "Jersey WRP",
        price: jerseyPrice,
        quantity: 1
      });
    }

    // Add additional donation item if there's any additional donation
    if (additionalDonation > 0) {
      itemDetails.push({
        id: "wrp-additional-donation",
        name: "Donasi Tambahan untuk Palestina", 
        price: additionalDonation,
        quantity: 1
      });
    }

    // Calculate gross_amount as exact sum of all item_details
    const calculatedGrossAmount = itemDetails.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);

    console.log('Payment calculation verification:', {
      baseAmount: baseAmount,
      fixedDonation: fixedDonation,
      jerseyPrice: jerseyPrice,
      additionalDonation: additionalDonation,
      calculatedTotalFromItems: calculatedGrossAmount,
      shouldMatchCalculatedTotal: actualTotalAmount,
      originalValidTotalAmount: validTotalAmount,
      itemDetails: itemDetails
    });

    // Midtrans Payment Links API format
    const paymentData = {
      transaction_details: {
        order_id: orderId,
        gross_amount: calculatedGrossAmount
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
      item_details: itemDetails,
      callbacks: {
        finish: process.env.PAYMENT_SUCCESS_URL || `${process.env.NEXT_PUBLIC_BASE_URL || 'https://registrasi.werunpalestina.id'}/success`,
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

    // Final validation before sending to Midtrans
    if (!paymentData.transaction_details?.gross_amount || !paymentData.transaction_details?.order_id) {
      console.error('Critical payment data missing:', {
        gross_amount: paymentData.transaction_details?.gross_amount,
        order_id: paymentData.transaction_details?.order_id,
        transaction_details: paymentData.transaction_details
      });
      throw new Error('Critical payment data is missing');
    }

    // Verify gross_amount matches item_details total
    const itemDetailsTotal = paymentData.item_details.reduce((total, item) => total + (item.price * item.quantity), 0);
    if (paymentData.transaction_details.gross_amount !== itemDetailsTotal) {
      console.error('Amount mismatch detected:', {
        gross_amount: paymentData.transaction_details.gross_amount,
        item_details_total: itemDetailsTotal,
        difference: paymentData.transaction_details.gross_amount - itemDetailsTotal
      });
      // Fix the gross_amount to match item_details
      paymentData.transaction_details.gross_amount = itemDetailsTotal;
    }

    // Create auth header
    const authString = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64');
    
    // Use Midtrans Payment Links API
    console.log('Sending request to Midtrans Payment Links API:', {
      url: `${MIDTRANS_API_URL}/v1/payment-links`,
      gross_amount: paymentData.transaction_details.gross_amount,
      item_details_breakdown: paymentData.item_details.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity
      })),
      item_details_sum: paymentData.item_details.reduce((sum, item) => sum + (item.price * item.quantity), 0)
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
      range: `${SHEET_NAME}!D:D`, // Column D contains emails (unchanged)
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
            'packageType',
            'jerseySize',
            'gender',
            'completeAddress',
            'simpleAddress',
            'fullAddressStreet',
            'fullAddressRtRw',
            'fullAddressDistrict',
            'fullAddressCity',
            'fullAddressProvince',
            'fullAddressPostcode',
            'baseAmount',
            'fixedDonation',
            'jerseyPrice',
            'additionalDonation',
            'registrationDate',
            'status',
            'paymentStatus',
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
            if(key === 'completeAddress') {
                // Combine address fields into a single complete address
                if (registrationData.simpleAddress) {
                    return registrationData.simpleAddress;
                } else if (registrationData.fullAddress) {
                    const addressParts = [
                        registrationData.fullAddress.street,
                        registrationData.fullAddress.rtRw,
                        registrationData.fullAddress.district,
                        registrationData.fullAddress.city,
                        registrationData.fullAddress.province,
                        registrationData.fullAddress.postcode
                    ].filter(part => part && part.trim() !== '');
                    return addressParts.join(', ');
                }
                return '';
            }
            if(key === 'totalAmount') {
                const packageType = registrationData.packageType || 'basic';
                let baseAmount = 0;
                let fixedDonation = 0;
                let jerseyPrice = 0;
                
                if (packageType === 'basic') {
                  baseAmount = 80000;
                  fixedDonation = 20000;
                  jerseyPrice = 0;
                } else if (packageType === 'basic-jersey') {
                  baseAmount = 80000;
                  fixedDonation = 20000;
                  jerseyPrice = 150000;
                } else if (packageType === 'jersey-only') {
                  baseAmount = 0;
                  fixedDonation = 0;
                  jerseyPrice = 150000;
                }
                
                const additionalDonation = registrationData.additionalDonation || 0;
                return baseAmount + fixedDonation + jerseyPrice + additionalDonation;
            }
            if(key === 'baseAmount') {
                const packageType = registrationData.packageType || 'basic';
                if (packageType === 'basic' || packageType === 'basic-jersey') {
                  return 80000;
                } else {
                  return 0;
                }
            }
            if(key === 'fixedDonation') {
                const packageType = registrationData.packageType || 'basic';
                if (packageType === 'basic' || packageType === 'basic-jersey') {
                  return 20000;
                } else {
                  return 0;
                }
            }
            if(key === 'jerseyPrice') {
                const packageType = registrationData.packageType || 'basic';
                if (packageType === 'basic-jersey' || packageType === 'jersey-only') {
                  return 150000;
                } else {
                  return 0;
                }
            }
            if (key === 'fullAddressStreet') {
                return registrationData.fullAddress?.street || '';
            }
            if (key === 'fullAddressRtRw') {
                return registrationData.fullAddress?.rtRw || '';
            }
            if (key === 'fullAddressDistrict') {
                return registrationData.fullAddress?.district || '';
            }
            if (key === 'fullAddressCity') {
                return registrationData.fullAddress?.city || '';
            }
            if (key === 'fullAddressProvince') {
                return registrationData.fullAddress?.province || '';
            }
            if (key === 'fullAddressPostcode') {
                return registrationData.fullAddress?.postcode || '';
            }
            return registrationData[key] !== undefined ? registrationData[key] : '';
        })];

        // Get the Google Sheets client
        const sheets = await getGoogleSheetsClient();
        
        // Check if sheet exists and create headers if needed
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A1:AB1`,
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
                    'Package Type',
                    'Jersey Size',
                    'Gender',
                    'Complete Address',
                    'Simple Address',
                    'Full Address Street',
                    'Full Address RT/RW',
                    'Full Address District',
                    'Full Address City',
                    'Full Address Province',
                    'Full Address Postcode',
                    'Base Amount',
                    'Fixed Donation',
                    'Jersey Price',
                    'Additional Donation',
                    'Registration Date',
                    'Status',
                    'Payment Status',
                    'Total Amount', 
                    'Donation Date',
                    'Payment Link',
                    'Midtrans Order ID'
                ];

                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A1:AB1`,
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

        // Debug: Log the data being appended
        console.log('Data being appended to Google Sheets:');
        console.log('Column order:', columnOrder);
        console.log('Data values:', dataToAppend[0]);
        console.log('MidtransOrderId will be stored in column AB (index 27):', dataToAppend[0][27]);

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
    
    const { name, email, phone, stravaName, packageType, donationAmount, jerseySize, gender, simpleAddress, fullAddress } = body;

    // Validate required fields
    if (!name || !email || !phone || !stravaName || !packageType) {
      console.log('Validation failed: missing required fields');
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate jersey size for packages that require it
    if ((packageType === 'basic-jersey' || packageType === 'jersey-only') && !jerseySize) {
      console.log('Validation failed: jersey size required for selected package');
      return NextResponse.json(
        { error: 'Jersey size is required for selected package' },
        { status: 400 }
      );
    }

    // Validate gender for packages that require it
    if ((packageType === 'basic-jersey' || packageType === 'jersey-only') && !gender) {
      console.log('Validation failed: gender required for selected package');
      return NextResponse.json(
        { error: 'Gender is required for selected package' },
        { status: 400 }
      );
    }

    // Validate address - either simple address or full address is required
    if (!simpleAddress && (!fullAddress || !fullAddress.street || !fullAddress.city || !fullAddress.province)) {
      console.log('Validation failed: address information is required');
      return NextResponse.json(
        { error: 'Address information is required' },
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

    // Calculate package amounts
    const packageTypeValue = packageType || 'basic';
    let baseAmount = 0;
    let fixedDonation = 0;
    let jerseyPrice = 0;
    
    if (packageTypeValue === 'basic') {
      baseAmount = 80000;
      fixedDonation = 20000;
      jerseyPrice = 0;
    } else if (packageTypeValue === 'basic-jersey') {
      baseAmount = 80000;
      fixedDonation = 20000;
      jerseyPrice = 150000;
    } else if (packageTypeValue === 'jersey-only') {
      baseAmount = 0;
      fixedDonation = 0;
      jerseyPrice = 150000;
    }
    
    const additionalDonation = parseFloat(donationAmount) || 0;
    const packageTotal = baseAmount + fixedDonation + jerseyPrice; // This is the package price
    const totalAmount = packageTotal + additionalDonation;
    
    console.log('Registration details:', {
      name: name.trim(),
      email: email.trim(),
      packageType: packageTypeValue,
      baseAmount: baseAmount,
      fixedDonation: fixedDonation,
      jerseyPrice: jerseyPrice,
      packageTotal: packageTotal,
      additionalDonation: additionalDonation,
      totalAmount: totalAmount
    });

    // Create registration data
    const registration = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      stravaName: stravaName.trim(),
      packageType: packageTypeValue,
      jerseySize: jerseySize || '',
      gender: gender || '',
      simpleAddress: simpleAddress || '',
      fullAddress: fullAddress || {
        street: '',
        rtRw: '',
        district: '',
        city: '',
        province: '',
        postcode: ''
      },
      baseAmount: baseAmount,
      fixedDonation: fixedDonation,
      jerseyPrice: jerseyPrice,
      additionalDonation: additionalDonation,
      registrationDate: new Date().toISOString(),
      status: 'pending',
      paymentStatus: 'unpaid',
      donationDate: new Date().toISOString(),
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
          { error: 'Email anda telah terdaftar, silahkan cek kotak masuk email anda untuk konfirmasi pembayaran' },
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
      packageType: packageTypeValue,
      baseAmount: baseAmount,
      fixedDonation: fixedDonation,
      jerseyPrice: jerseyPrice,
      additionalDonation: additionalDonation,
      totalAmount: totalAmount,
      data: {
        name: registration.name,
        email: registration.email,
        registrationDate: registration.registrationDate,
        packageType: packageTypeValue,
        baseAmount: baseAmount,
        fixedDonation: fixedDonation,
        jerseyPrice: jerseyPrice,
        additionalDonation: additionalDonation,
        totalAmount: totalAmount,
        paymentInstructions: additionalDonation > 0 
          ? `Silakan lanjutkan ke link pembayaran untuk menyelesaikan pendaftaran Anda (Rp ${totalAmount.toLocaleString('id-ID')} termasuk donasi tambahan).`
          : `Silakan lanjutkan ke link pembayaran untuk menyelesaikan pendaftaran Anda (Rp ${totalAmount.toLocaleString('id-ID')}).`
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
      range: `${SHEET_NAME}!A2:AB1000`, // Skip header row, get up to 1000 rows (now up to column AB for complete address and midtrans order ID)
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
      packageType: row[6] || 'basic',
      jerseySize: row[7] || '',
      gender: row[8] || '',
      completeAddress: row[9] || '',
      simpleAddress: row[10] || '',
      fullAddress: {
        street: row[11] || '',
        rtRw: row[12] || '',
        district: row[13] || '',
        city: row[14] || '',
        province: row[15] || '',
        postcode: row[16] || ''
      },
      baseAmount: parseFloat(row[17]) || 0,
      fixedDonation: parseFloat(row[18]) || 0,
      jerseyPrice: parseFloat(row[19]) || 0,
      additionalDonation: parseFloat(row[20]) || 0,
      registrationDate: row[21] || '',
      status: row[22] || 'pending',
      paymentStatus: row[23] || 'unpaid',
      totalAmount: parseFloat(row[24]) || 100000,
      donationDate: row[25] || null,
      paymentLink: row[26] || '',
      midtransOrderId: row[27] || ''
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
