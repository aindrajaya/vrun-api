import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { google } from 'googleapis';

// Google Sheets API configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'WRP_Registrations';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

/**
 * Gets an authenticated Google Sheets client
 * @returns {Promise<Object>} - Authenticated Google Sheets client
 */
async function getGoogleSheetsClient() {
    try {
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
 * Updates registration status in Google Sheets
 * @param {string} orderId - Midtrans order ID
 * @param {string} transactionStatus - Transaction status from Midtrans
 * @param {string} paymentType - Payment type used
 * @returns {Promise<Object>} - Update result
 */
async function updateRegistrationInGoogleSheets(orderId, transactionStatus, paymentType) {
    try {
        console.log('Updating Google Sheets for order:', orderId, 'status:', transactionStatus);
        
        const sheets = await getGoogleSheetsClient();
        
        // Get all data to find the row with matching order ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:N`, // Get all columns
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
            console.log('No data found in sheet');
            return { success: false, message: 'No data found in sheet' };
        }

        // Find the row with matching Midtrans Order ID (column N)
        // Handle both exact matches and partial matches (in case Midtrans appends timestamps)
        let targetRowIndex = -1;
        let foundOrderId = null;
        
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const midtransOrderId = rows[i][13]; // Column N (index 13)
            
            if (midtransOrderId) {
                // First try exact match
                if (midtransOrderId === orderId) {
                    targetRowIndex = i + 1; // Google Sheets is 1-indexed
                    foundOrderId = midtransOrderId;
                    break;
                }
                
                // Then try partial match - check if the stored order ID is a prefix of the received order ID
                // This handles cases where Midtrans appends additional timestamps
                if (orderId.startsWith(midtransOrderId)) {
                    targetRowIndex = i + 1;
                    foundOrderId = midtransOrderId;
                    console.log(`Found partial match: stored="${midtransOrderId}", received="${orderId}"`);
                    break;
                }
            }
        }

        if (targetRowIndex === -1) {
            console.log('Order ID not found in sheet:', orderId);
            return { success: false, message: 'Order ID not found in sheet' };
        }

        // Determine new status based on transaction status
        let newStatus = 'pending';
        let newPaymentStatus = 'unpaid';

        switch (transactionStatus) {
            case 'capture':
            case 'settlement':
                newStatus = 'active';
                newPaymentStatus = 'paid';
                break;
            case 'pending':
                newStatus = 'pending';
                newPaymentStatus = 'pending';
                break;
            case 'deny':
            case 'cancel':
            case 'expire':
            case 'failure':
                newStatus = 'pending';
                newPaymentStatus = 'failed';
                break;
            default:
                newStatus = 'pending';
                newPaymentStatus = 'unpaid';
        }

        console.log(`Updating row ${targetRowIndex}: status=${newStatus}, paymentStatus=${newPaymentStatus}`);

        // Update status (column H) and payment status (column I)
        const updates = [
            {
                range: `${SHEET_NAME}!H${targetRowIndex}`, // Status column
                values: [[newStatus]]
            },
            {
                range: `${SHEET_NAME}!I${targetRowIndex}`, // Payment Status column
                values: [[newPaymentStatus]]
            }
        ];

        // Execute batch update
        const batchUpdateResponse = await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: updates
            }
        });

        console.log('Google Sheets updated successfully:', batchUpdateResponse.data);
        return { 
            success: true, 
            message: 'Registration status updated successfully',
            updatedRow: targetRowIndex,
            newStatus: newStatus,
            newPaymentStatus: newPaymentStatus
        };

    } catch (error) {
        console.error('Error updating Google Sheets:', error.message);
        return { 
            success: false, 
            message: 'Failed to update Google Sheets',
            error: error.message
        };
    }
}

/**
 * Updates registration status in local JSON file
 * @param {string} orderId - Midtrans order ID
 * @param {string} transactionStatus - Transaction status from Midtrans
 * @param {string} paymentType - Payment type used
 * @returns {Promise<Object>} - Update result
 */
async function updateLocalRegistration(orderId, transactionStatus, paymentType) {
    try {
        const dataPath = path.join(process.cwd(), 'registrations.json');
        
        if (!fs.existsSync(dataPath)) {
            console.log('Local registrations file not found');
            return { success: false, message: 'Local registrations file not found' };
        }

        const data = fs.readFileSync(dataPath, 'utf8');
        const registrations = JSON.parse(data);

        // Find registration with matching order ID
        // Handle both exact matches and partial matches (in case Midtrans appends timestamps)
        let registrationIndex = -1;
        let foundOrderId = null;
        
        for (let i = 0; i < registrations.length; i++) {
            const reg = registrations[i];
            if (reg.midtransOrderId) {
                // First try exact match
                if (reg.midtransOrderId === orderId) {
                    registrationIndex = i;
                    foundOrderId = reg.midtransOrderId;
                    break;
                }
                
                // Then try partial match - check if the stored order ID is a prefix of the received order ID
                if (orderId.startsWith(reg.midtransOrderId)) {
                    registrationIndex = i;
                    foundOrderId = reg.midtransOrderId;
                    console.log(`Found partial match in local: stored="${reg.midtransOrderId}", received="${orderId}"`);
                    break;
                }
            }
        }
        
        if (registrationIndex === -1) {
            console.log('Registration not found for order ID:', orderId);
            console.log('Available order IDs:', registrations
                .filter(reg => reg.midtransOrderId)
                .map(reg => reg.midtransOrderId)
            );
            return { success: false, message: 'Registration not found for order ID' };
        }

        // Determine new status based on transaction status
        let newStatus = 'pending';
        let newPaymentStatus = 'unpaid';

        switch (transactionStatus) {
            case 'capture':
            case 'settlement':
                newStatus = 'active';
                newPaymentStatus = 'paid';
                break;
            case 'pending':
                newStatus = 'pending';
                newPaymentStatus = 'pending';
                break;
            case 'deny':
            case 'cancel':
            case 'expire':
            case 'failure':
                newStatus = 'pending';
                newPaymentStatus = 'failed';
                break;
            default:
                newStatus = 'pending';
                newPaymentStatus = 'unpaid';
        }

        // Update the registration
        registrations[registrationIndex].status = newStatus;
        registrations[registrationIndex].paymentStatus = newPaymentStatus;
        registrations[registrationIndex].paymentType = paymentType;
        registrations[registrationIndex].lastUpdated = new Date().toISOString();

        // Save back to file
        fs.writeFileSync(dataPath, JSON.stringify(registrations, null, 2));

        console.log('Local registration updated successfully:', {
            orderId,
            newStatus,
            newPaymentStatus,
            paymentType
        });

        return { 
            success: true, 
            message: 'Local registration updated successfully',
            registration: registrations[registrationIndex]
        };

    } catch (error) {
        console.error('Error updating local registration:', error.message);
        return { 
            success: false, 
            message: 'Failed to update local registration',
            error: error.message
        };
    }
}

/**
 * Verifies Midtrans signature for webhook security
 * @param {Object} notification - Notification data from Midtrans
 * @param {string} signature - Signature from Midtrans
 * @returns {boolean} - Whether signature is valid
 */
function verifySignature(notification, signature) {
    if (!MIDTRANS_SERVER_KEY) {
        console.warn('Midtrans server key not configured, skipping signature verification');
        return true; // Allow in development if no key is set
    }

    try {
        const { order_id, status_code, gross_amount } = notification;
        const signatureString = `${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`;
        const hash = crypto.createHash('sha512').update(signatureString).digest('hex');
        
        const isValid = hash === signature;
        console.log('Signature verification:', isValid ? 'VALID' : 'INVALID');
        
        return isValid;
    } catch (error) {
        console.error('Error verifying signature:', error);
        return false;
    }
}

/**
 * POST /api/webhooks/midtrans
 * Handle Midtrans payment notifications
 */
export async function POST(request) {
    try {
        console.log('=== Midtrans Webhook Notification Received ===');
        
        const notification = await request.json();
        console.log('Notification data:', JSON.stringify(notification, null, 2));

        // Extract important fields
        const {
            order_id,
            transaction_status,
            fraud_status,
            payment_type,
            gross_amount,
            signature_key
        } = notification;

        // Verify signature for security
        if (!verifySignature(notification, signature_key)) {
            console.error('Invalid signature detected');
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 401 }
            );
        }

        console.log('Processing payment notification:', {
            order_id,
            transaction_status,
            fraud_status,
            payment_type,
            gross_amount
        });

        // Handle different transaction statuses
        let shouldUpdateStatus = true;
        
        // Check for fraud
        if (fraud_status === 'challenge' || fraud_status === 'deny') {
            console.log('Transaction flagged for fraud:', fraud_status);
            shouldUpdateStatus = false;
        }

        if (shouldUpdateStatus) {
            // Update local registration file
            const localResult = await updateLocalRegistration(order_id, transaction_status, payment_type);
            console.log('Local update result:', localResult);

            // Update Google Sheets
            const sheetsResult = await updateRegistrationInGoogleSheets(order_id, transaction_status, payment_type);
            console.log('Sheets update result:', sheetsResult);

            // Log the results
            if (localResult.success && sheetsResult.success) {
                console.log('✅ Both local and Google Sheets updated successfully');
            } else {
                console.warn('⚠️ Partial update completed:', {
                    local: localResult.success,
                    sheets: sheetsResult.success
                });
            }
        }

        // Always return 200 to acknowledge receipt
        return NextResponse.json({
            success: true,
            message: 'Notification processed successfully',
            order_id: order_id,
            transaction_status: transaction_status
        });

    } catch (error) {
        console.error('Webhook processing error:', error);
        
        // Still return 200 to avoid Midtrans retrying
        return NextResponse.json({
            success: false,
            message: 'Error processing notification',
            error: error.message
        });
    }
}

/**
 * GET /api/webhooks/midtrans
 * Health check for webhook endpoint
 */
export async function GET() {
    return NextResponse.json({
        status: 'Midtrans webhook endpoint is running',
        timestamp: new Date().toISOString()
    });
}
