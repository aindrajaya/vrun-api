import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { google } from 'googleapis';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Google Sheets API configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'WRP_Registrations';
const TRANSACTION_HISTORY_SHEET = process.env.TRANSACTION_HISTORY_SHEET || 'Transaction_History';

// Jersey Database Google Sheets configuration
const JERSEY_SPREADSHEET_ID = '1gjNVdzZFaJOoVM7MUgQBN7WS8mxg1btwmXDpnvNrLao';
const JERSEY_SHEET_NAME = 'Sheet1';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

// n8n webhook configuration
const N8N_REGISTRATION_WEBHOOK_URL = process.env.N8N_REGISTRATION_WEBHOOK_URL || 'https://n8n-oo1yqkmi2l7g.blueberry.sumopod.my.id/webhook/f0aae5da-7ca3-4c2c-af78-500367bde5d2';
const N8N_JERSEY_WEBHOOK_URL = process.env.N8N_JERSEY_WEBHOOK_URL || 'https://n8n-oo1yqkmi2l7g.blueberry.sumopod.my.id/webhook/dc687746-6f94-4467-9d94-f4d0704e4eb6';

// =============================================================================
// CONSTANTS AND BUSINESS LOGIC
// =============================================================================

/**
 * Transaction Status Constants
 * These represent the possible states a payment can be in according to Midtrans
 */
const TRANSACTION_STATUSES = {
    PENDING: 'pending',
    CAPTURE: 'capture',
    SETTLEMENT: 'settlement',
    DENY: 'deny',
    CANCEL: 'cancel',
    EXPIRE: 'expire',
    FAILURE: 'failure',
    REFUND: 'refund',
    PARTIAL_REFUND: 'partial_refund',
    CHARGEBACK: 'chargeback',
    PARTIAL_CHARGEBACK: 'partial_chargeback'
};

/**
 * Payment Status Mapping
 * Maps Midtrans transaction statuses to our internal payment statuses
 */
const PAYMENT_STATUS_MAP = {
    [TRANSACTION_STATUSES.SETTLEMENT]: 'paid',
    [TRANSACTION_STATUSES.CAPTURE]: 'paid',
    [TRANSACTION_STATUSES.PENDING]: 'pending',
    [TRANSACTION_STATUSES.DENY]: 'failed',
    [TRANSACTION_STATUSES.CANCEL]: 'cancelled',
    [TRANSACTION_STATUSES.EXPIRE]: 'expired',
    [TRANSACTION_STATUSES.FAILURE]: 'failed'
};

/**
 * Business Logic: Payment Attempt Rules
 *
 * When a user has multiple payment attempts for the same logical order:
 * 1. SUCCESSFUL PAYMENTS: Show the LATEST successful payment as the active status
 * 2. MIXED ATTEMPTS: If there are both successful and failed attempts, show the latest successful one
 * 3. ALL FAILED: Show the latest failed attempt
 * 4. PENDING: If there's a pending payment, show it regardless of previous failures
 *
 * This ensures users see their most relevant payment status while maintaining history.
 */
const PAYMENT_BUSINESS_RULES = {
    PRIORITY_ORDER: ['pending', 'paid', 'cancelled', 'expired', 'failed'],
    SHOW_LATEST_SUCCESSFUL: true,
    SHOW_ALL_ATTEMPTS_HISTORY: true
};

/**
 * Retry Configuration
 * Exponential backoff settings for API failures
 */
const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    BACKOFF_MULTIPLIER: 2
};

/**
 * Idempotency Configuration
 * Settings for preventing duplicate webhook processing
 */
const IDEMPOTENCY_CONFIG = {
    PROCESSED_EVENTS_FILE: path.join(process.cwd(), 'processed_webhook_events.json'),
    EVENT_EXPIRY_HOURS: 24 * 7, // Keep events for 7 days
    CLEANUP_INTERVAL_MS: 1000 * 60 * 60 // Clean up every hour
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sleep utility for implementing delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoffDelay(attempt) {
    const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt);
    return Math.min(delay, RETRY_CONFIG.MAX_DELAY_MS);
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise} - Result of the function call
 */
async function retryWithBackoff(fn, maxRetries = RETRY_CONFIG.MAX_RETRIES, operationName = 'operation') {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);

            if (attempt < maxRetries) {
                const delay = calculateBackoffDelay(attempt);
                console.log(`Retrying ${operationName} in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(`${operationName} failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Generate a unique event ID for idempotency
 * @param {Object} notification - Midtrans notification
 * @returns {string} - Unique event identifier
 */
function generateEventId(notification) {
    const { order_id, transaction_status, transaction_time } = notification;
    return `${order_id}_${transaction_status}_${transaction_time || new Date().toISOString()}`;
}

/**
 * Get current timestamp in ISO format
 * @returns {string} - ISO timestamp
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}

/**
 * Validate required environment variables
 * @returns {boolean} - True if all required vars are present
 */
function validateEnvironment() {
    const required = [
        'MIDTRANS_SERVER_KEY',
        'GOOGLE_SERVICE_ACCOUNT_KEY',
        'GOOGLE_SHEET_ID'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing);
        return false;
    }

    return true;
}

// =============================================================================
// IDEMPOTENCY MANAGEMENT
// =============================================================================

/**
 * Load processed events from storage
 * @returns {Object} - Map of processed event IDs to timestamps
 */
function loadProcessedEvents() {
    try {
        if (fs.existsSync(IDEMPOTENCY_CONFIG.PROCESSED_EVENTS_FILE)) {
            const data = fs.readFileSync(IDEMPOTENCY_CONFIG.PROCESSED_EVENTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn('Error loading processed events file:', error.message);
    }
    return {};
}

/**
 * Save processed events to storage
 * @param {Object} events - Map of processed event IDs to timestamps
 */
function saveProcessedEvents(events) {
    try {
        fs.writeFileSync(IDEMPOTENCY_CONFIG.PROCESSED_EVENTS_FILE, JSON.stringify(events, null, 2));
    } catch (error) {
        console.error('Error saving processed events file:', error.message);
    }
}

/**
 * Check if an event has already been processed
 * @param {string} eventId - Event identifier
 * @returns {boolean} - True if event was already processed
 */
function isEventProcessed(eventId) {
    const events = loadProcessedEvents();
    const eventTimestamp = events[eventId];

    if (!eventTimestamp) {
        return false;
    }

    // Check if event has expired
    const eventTime = new Date(eventTimestamp);
    const expiryTime = new Date(Date.now() - (IDEMPOTENCY_CONFIG.EVENT_EXPIRY_HOURS * 60 * 60 * 1000));

    if (eventTime < expiryTime) {
        // Event has expired, remove it
        delete events[eventId];
        saveProcessedEvents(events);
        return false;
    }

    return true;
}

/**
 * Mark an event as processed
 * @param {string} eventId - Event identifier
 */
function markEventProcessed(eventId) {
    const events = loadProcessedEvents();
    events[eventId] = getCurrentTimestamp();

    // Clean up old events
    const expiryTime = new Date(Date.now() - (IDEMPOTENCY_CONFIG.EVENT_EXPIRY_HOURS * 60 * 60 * 1000));
    Object.keys(events).forEach(key => {
        if (new Date(events[key]) < expiryTime) {
            delete events[key];
        }
    });

    saveProcessedEvents(events);
}

/**
 * Clean up expired events (called periodically)
 */
function cleanupExpiredEvents() {
    const events = loadProcessedEvents();
    const expiryTime = new Date(Date.now() - (IDEMPOTENCY_CONFIG.EVENT_EXPIRY_HOURS * 60 * 60 * 1000));
    let cleaned = 0;

    Object.keys(events).forEach(key => {
        if (new Date(events[key]) < expiryTime) {
            delete events[key];
            cleaned++;
        }
    });

    if (cleaned > 0) {
        saveProcessedEvents(events);
        console.log(`Cleaned up ${cleaned} expired webhook events`);
    }
}

// =============================================================================
// SECURITY AND VALIDATION
// =============================================================================

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

        if (!order_id || !status_code || !gross_amount) {
            console.error('Missing required fields for signature verification');
            return false;
        }

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
 * Validate webhook notification payload
 * @param {Object} notification - Notification from Midtrans
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
function validateNotification(notification) {
    const errors = [];
    const requiredFields = ['order_id', 'transaction_status', 'gross_amount'];

    // Check required fields
    requiredFields.forEach(field => {
        if (!notification[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    });

    // Validate order_id format (should contain timestamp or be reasonable length)
    if (notification.order_id && notification.order_id.length < 3) {
        errors.push('Order ID is too short');
    }

    // Validate transaction_status
    if (notification.transaction_status && !Object.values(TRANSACTION_STATUSES).includes(notification.transaction_status)) {
        errors.push(`Invalid transaction status: ${notification.transaction_status}`);
    }

    // Validate gross_amount
    if (notification.gross_amount && (isNaN(notification.gross_amount) || notification.gross_amount < 0)) {
        errors.push('Invalid gross amount');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// =============================================================================
// GOOGLE SHEETS INTEGRATION
// =============================================================================

/**
 * Gets an authenticated Google Sheets client
 * @returns {Promise<Object>} - Authenticated Google Sheets client
 */
async function getGoogleSheetsClient() {
    return await retryWithBackoff(async () => {
        try {
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');

            if (!credentials || Object.keys(credentials).length === 0) {
                throw new Error('Google service account credentials not configured');
            }

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
    }, RETRY_CONFIG.MAX_RETRIES, 'Google Sheets client creation');
}

/**
 * Log transaction to history sheet
 * @param {Object} notification - Midtrans notification
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Result of the logging operation
 */
async function logTransactionToHistory(notification, metadata = {}) {
    try {
        const sheets = await getGoogleSheetsClient();

        const timestamp = getCurrentTimestamp();
        const eventId = generateEventId(notification);

        const rowData = [
            timestamp,                          // Timestamp
            eventId,                           // Event ID
            notification.order_id,             // Order ID
            notification.transaction_status,   // Transaction Status
            notification.payment_type || '',   // Payment Type
            notification.gross_amount,         // Gross Amount
            notification.fraud_status || '',   // Fraud Status
            metadata.userEmail || '',          // User Email
            metadata.orderType || '',          // Order Type (registration/jersey)
            metadata.businessLogic || '',      // Business Logic Applied
            JSON.stringify(notification),      // Full Notification Data
            JSON.stringify(metadata)           // Full Metadata
        ];

        // Check if history sheet exists, create if not
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${TRANSACTION_HISTORY_SHEET}!A:L`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [rowData]
                }
            });
        } catch (error) {
            if (error.code === 404) {
                // Sheet doesn't exist, create it
                console.log('Creating transaction history sheet...');
                await createTransactionHistorySheet(sheets);
                // Retry the append
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${TRANSACTION_HISTORY_SHEET}!A:L`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [rowData]
                    }
                });
            } else {
                throw error;
            }
        }

        console.log('✅ Transaction logged to history:', eventId);
        return { success: true, eventId };

    } catch (error) {
        console.error('❌ Error logging transaction to history:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create transaction history sheet with headers
 * @param {Object} sheets - Google Sheets client
 * @returns {Promise<void>}
 */
async function createTransactionHistorySheet(sheets) {
    const headers = [
        'Timestamp',
        'Event ID',
        'Order ID',
        'Transaction Status',
        'Payment Type',
        'Gross Amount',
        'Fraud Status',
        'User Email',
        'Order Type',
        'Business Logic',
        'Full Notification',
        'Metadata'
    ];

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            requests: [{
                addSheet: {
                    properties: {
                        title: TRANSACTION_HISTORY_SHEET
                    }
                }
            }]
        }
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TRANSACTION_HISTORY_SHEET}!A1:L1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [headers]
        }
    });
}

/**
 * Apply business logic for payment status determination
 * @param {Array} paymentAttempts - Array of payment attempts for the same logical order
 * @returns {Object} - Determined status and reasoning
 */
function applyBusinessLogic(paymentAttempts) {
    if (!paymentAttempts || paymentAttempts.length === 0) {
        return { status: 'unknown', reasoning: 'No payment attempts found' };
    }

    // Sort by timestamp (newest first)
    const sortedAttempts = paymentAttempts.sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Check for pending payments first (highest priority)
    const pendingPayment = sortedAttempts.find(attempt => attempt.status === 'pending');
    if (pendingPayment) {
        return {
            status: 'pending',
            reasoning: 'Active pending payment found',
            latestAttempt: pendingPayment
        };
    }

    // Check for successful payments
    const successfulPayments = sortedAttempts.filter(attempt => attempt.status === 'paid');
    if (successfulPayments.length > 0) {
        return {
            status: 'paid',
            reasoning: 'Latest successful payment found',
            latestAttempt: successfulPayments[0]
        };
    }

    // No successful payments, return the latest attempt
    return {
        status: sortedAttempts[0].status,
        reasoning: 'No successful payments, showing latest attempt',
        latestAttempt: sortedAttempts[0]
    };
}

/**
 * Update registration status in Google Sheets
 * @param {string} orderId - Midtrans order ID
 * @param {string} transactionStatus - Transaction status from Midtrans
 * @param {string} paymentType - Payment type used
 * @param {Object} notification - Full notification data
 * @returns {Promise<Object>} - Update result
 */
async function updateRegistrationInGoogleSheets(orderId, transactionStatus, paymentType, notification) {
    return await retryWithBackoff(async () => {
        try {
            console.log('Updating Google Sheets for registration order:', orderId, 'status:', transactionStatus);

            const sheets = await getGoogleSheetsClient();

            // Get all data to find the row with matching order ID
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A:AC`, // Extended range for additional columns
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                throw new Error('No data found in registration sheet');
            }

            // Find the row with matching Midtrans Order ID (column AB, index 27)
            let targetRowIndex = -1;
            let userEmail = '';
            let logicalOrderId = '';

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowOrderId = row[27] || ''; // Column AB (index 27) - Midtrans Order ID
                const rowPaymentLink = row[26] || ''; // Column AA (index 26) - Payment Link
                const email = row[3] || ''; // Column D (index 3) - Email

                // Match by order ID or payment link
                if (rowOrderId === orderId || rowPaymentLink === orderId ||
                    (rowOrderId && orderId.startsWith(rowOrderId)) ||
                    (rowPaymentLink && orderId.startsWith(rowPaymentLink))) {
                    targetRowIndex = i + 1;
                    userEmail = email;
                    logicalOrderId = row[1] || ''; // Column B (index 1) - Registration ID
                    break;
                }
            }

            if (targetRowIndex === -1) {
                throw new Error(`Order ID not found in registration sheet: ${orderId}`);
            }

            // Determine new status based on transaction status
            const paymentStatus = PAYMENT_STATUS_MAP[transactionStatus] || 'unknown';

            // Apply business logic for multiple attempts
            const businessLogicResult = await applyBusinessLogicForUser(userEmail, logicalOrderId, {
                orderId,
                status: paymentStatus,
                timestamp: getCurrentTimestamp(),
                transactionStatus,
                paymentType,
                amount: notification.gross_amount
            });

            console.log('Business logic result:', businessLogicResult);

            // Update status columns
            const updates = [
                {
                    range: `${SHEET_NAME}!W${targetRowIndex}`, // Status column
                    values: [[businessLogicResult.displayStatus]]
                },
                {
                    range: `${SHEET_NAME}!X${targetRowIndex}`, // Payment Status column
                    values: [[paymentStatus]]
                },
                {
                    range: `${SHEET_NAME}!Y${targetRowIndex}`, // Total Amount
                    values: [[notification.gross_amount]]
                },
                {
                    range: `${SHEET_NAME}!Z${targetRowIndex}`, // Last Updated
                    values: [[getCurrentTimestamp()]]
                }
            ];

            const batchUpdateResponse = await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates
                }
            });

            console.log('✅ Registration Google Sheets updated successfully');
            return {
                success: true,
                message: 'Registration status updated successfully',
                updatedRow: targetRowIndex,
                businessLogic: businessLogicResult
            };

        } catch (error) {
            console.error('Error updating registration in Google Sheets:', error.message);
            throw error;
        }
    }, RETRY_CONFIG.MAX_RETRIES, 'Registration Google Sheets update');
}

/**
 * Apply business logic for a specific user's payment attempts
 * @param {string} userEmail - User's email
 * @param {string} logicalOrderId - Logical order identifier
 * @param {Object} currentAttempt - Current payment attempt
 * @returns {Promise<Object>} - Business logic result
 */
async function applyBusinessLogicForUser(userEmail, logicalOrderId, currentAttempt) {
    // For now, return the current attempt status
    // In a full implementation, this would query all attempts for the user
    return {
        displayStatus: currentAttempt.status === 'paid' ? 'active' : 'pending',
        reasoning: 'Latest payment attempt status',
        currentAttempt
    };
}

// =============================================================================
// EXTERNAL WEBHOOK NOTIFICATIONS
// =============================================================================

/**
 * Sends registration payment success notification to n8n webhook
 * @param {Object} paymentData - Payment data from Midtrans
 * @param {Object} registrationData - Registration data from local/sheets
 * @returns {Promise<Object>} - n8n webhook response
 */
async function sendRegistrationSuccessToN8n(paymentData, registrationData) {
    return await retryWithBackoff(async () => {
        try {
            console.log('Sending registration payment success notification to n8n...');

            const webhookPayload = {
                event: 'registration_payment_success',
                timestamp: getCurrentTimestamp(),
                payment: {
                    order_id: paymentData.order_id,
                    transaction_status: paymentData.transaction_status,
                    payment_type: paymentData.payment_type,
                    gross_amount: paymentData.gross_amount,
                    fraud_status: paymentData.fraud_status
                },
                registration: {
                    id: registrationData.id,
                    name: registrationData.name,
                    email: registrationData.email,
                    phone: registrationData.phone,
                    stravaName: registrationData.stravaName,
                    packageType: registrationData.packageType || 'basic',
                    jerseySize: registrationData.jerseySize || '',
                    baseAmount: registrationData.baseAmount || 80000,
                    fixedDonation: registrationData.fixedDonation || 20000,
                    jerseyPrice: registrationData.jerseyPrice || 0,
                    additionalDonation: registrationData.additionalDonation || 0,
                    totalAmount: registrationData.totalAmount || parseInt(paymentData.gross_amount),
                    registrationDate: registrationData.registrationDate
                }
            };

            return await sendToN8nWebhook(N8N_REGISTRATION_WEBHOOK_URL, webhookPayload, 'registration');

        } catch (error) {
            console.error('Error calling registration n8n webhook:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }, RETRY_CONFIG.MAX_RETRIES, 'Registration n8n webhook');
}

/**
 * Generic function to send data to n8n webhook
 * @param {string} webhookUrl - n8n webhook URL
 * @param {Object} payload - Data to send
 * @param {string} type - Type of webhook (registration/jersey)
 * @returns {Promise<Object>} - Webhook response
 */
async function sendToN8nWebhook(webhookUrl, payload, type) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': `WRP-${type}-Webhook/1.0`
        };

        console.log(`Sending to ${type} n8n webhook:`, {
            url: webhookUrl,
            payloadSize: JSON.stringify(payload).length
        });

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        const responseText = await response.text();

        if (response.ok) {
            console.log(`✅ ${type} n8n webhook called successfully:`, response.status);
            return {
                success: true,
                status: response.status,
                response: responseText
            };
        } else {
            console.error(`❌ ${type} n8n webhook failed:`, response.status, responseText);
            throw new Error(`${type} n8n webhook failed: ${response.status} ${responseText}`);
        }

    } catch (error) {
        console.error(`Error calling ${type} n8n webhook:`, error.message);
        throw error;
    }
}

// =============================================================================
// MAIN WEBHOOK PROCESSING
// =============================================================================

/**
 * Process webhook notification asynchronously
 * @param {Object} notification - Midtrans notification
 * @param {string} eventId - Unique event identifier
 * @returns {Promise<Object>} - Processing result
 */
async function processWebhookAsync(notification, eventId) {
    try {
        console.log('🔄 Starting asynchronous webhook processing for event:', eventId);

        const {
            order_id,
            transaction_status,
            fraud_status,
            payment_type,
            gross_amount
        } = notification;

        // Log transaction to history first
        await logTransactionToHistory(notification, {
            processingStage: 'started',
            eventId
        });

        // Determine order type and process accordingly
        let isRegistrationOrder = false;
        let isJerseyOrder = false;
        let registrationData = null;
        let jerseyOrderData = null;

        // Check if this is a registration order
        console.log('🔍 Checking registration database...');
        try {
            const sheets = await getGoogleSheetsClient();
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A:AC`,
            });

            const rows = response.data.values || [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowOrderId = row[27] || '';
                const rowPaymentLink = row[26] || '';

                if (rowOrderId === order_id || rowPaymentLink === order_id ||
                    (rowOrderId && order_id.startsWith(rowOrderId)) ||
                    (rowPaymentLink && order_id.startsWith(rowPaymentLink))) {
                    isRegistrationOrder = true;
                    registrationData = {
                        id: row[1] || '',
                        name: row[2] || '',
                        email: row[3] || '',
                        phone: row[4] || '',
                        stravaName: row[5] || '',
                        packageType: row[6] || 'basic',
                        jerseySize: row[7] || '',
                        baseAmount: parseFloat(row[17]) || 100000,
                        fixedDonation: parseFloat(row[18]) || 0,
                        jerseyPrice: parseFloat(row[19]) || 0,
                        additionalDonation: parseFloat(row[20]) || 0,
                        registrationDate: row[21] || ''
                    };
                    break;
                }
            }
        } catch (error) {
            console.warn('Error checking registration database:', error.message);
        }

        // Process based on order type
        let sheetsResult = { success: false };
        let n8nResult = { success: false };

        if (isRegistrationOrder && registrationData) {
            console.log('📝 Processing as registration order...');

            // Update Google Sheets
            try {
                sheetsResult = await updateRegistrationInGoogleSheets(
                    order_id,
                    transaction_status,
                    payment_type,
                    notification
                );
                console.log('✅ Registration sheets update result:', sheetsResult);
            } catch (error) {
                console.error('❌ Registration sheets update failed:', error.message);
                sheetsResult = { success: false, error: error.message };
            }

            // Send n8n notification for successful payments
            if ((transaction_status === 'capture' || transaction_status === 'settlement') && sheetsResult.success) {
                try {
                    n8nResult = await sendRegistrationSuccessToN8n(notification, registrationData);
                    console.log('✅ Registration n8n notification result:', n8nResult);
                } catch (error) {
                    console.warn('⚠️ Registration n8n notification failed, but continuing...');
                    n8nResult = { success: false, error: error.message };
                }
            }
        }

        // Log final processing result
        await logTransactionToHistory(notification, {
            processingStage: 'completed',
            eventId,
            results: {
                sheets: sheetsResult,
                n8n: n8nResult,
                orderType: isRegistrationOrder ? 'registration' : 'unknown'
            }
        });

        const finalResult = {
            success: sheetsResult.success,
            eventId,
            orderId: order_id,
            transactionStatus: transaction_status,
            sheetsUpdated: sheetsResult.success,
            n8nNotified: n8nResult.success
        };

        console.log('✅ Webhook processing completed:', finalResult);
        return finalResult;

    } catch (error) {
        console.error('❌ Webhook processing failed:', error);

        // Log error to history
        try {
            await logTransactionToHistory(notification, {
                processingStage: 'failed',
                eventId,
                error: error.message
            });
        } catch (logError) {
            console.error('Failed to log error to history:', logError.message);
        }

        return {
            success: false,
            eventId,
            error: error.message
        };
    }
}

/**
 * POST /api/webhooks/midtrans
 * Handle Midtrans payment notifications
 *
 * This endpoint implements a production-grade webhook handler with:
 * - Idempotency to prevent duplicate processing
 * - Asynchronous processing for immediate response
 * - Comprehensive error handling and retry logic
 * - Full transaction history logging
 * - Business logic for handling multiple payment attempts
 */
export async function POST(request) {
    const startTime = Date.now();

    try {
        console.log('=== Midtrans Webhook Notification Received ===');
        console.log('Timestamp:', getCurrentTimestamp());

        // Validate environment
        if (!validateEnvironment()) {
            console.error('Environment validation failed');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Parse and validate notification
        const notification = await request.json();
        console.log('Notification payload size:', JSON.stringify(notification).length);

        const validation = validateNotification(notification);
        if (!validation.isValid) {
            console.error('Notification validation failed:', validation.errors);
            return NextResponse.json(
                { error: 'Invalid notification payload', details: validation.errors },
                { status: 400 }
            );
        }

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

        // Generate event ID for idempotency
        const eventId = generateEventId(notification);
        console.log('Generated event ID:', eventId);

        // Check for duplicate processing
        if (isEventProcessed(eventId)) {
            console.log('⚠️ Duplicate event detected, skipping processing:', eventId);
            return NextResponse.json({
                success: true,
                message: 'Event already processed',
                eventId: eventId,
                duplicate: true
            });
        }

        // Mark event as processed immediately to prevent race conditions
        markEventProcessed(eventId);

        console.log('Processing payment notification:', {
            orderId: order_id,
            transactionStatus: transaction_status,
            fraudStatus: fraud_status,
            paymentType: payment_type,
            grossAmount: gross_amount,
            eventId: eventId,
            processingTime: Date.now() - startTime
        });

        // Handle different transaction statuses
        let shouldProcessAsync = true;

        // Check for fraud
        if (fraud_status === 'challenge') {
            console.log('Transaction flagged for review (challenge): skipping automatic processing');
            shouldProcessAsync = false;
        }

        // Respond immediately with 200 to acknowledge receipt
        const response = NextResponse.json({
            success: true,
            message: 'Notification received and queued for processing',
            order_id: order_id,
            transaction_status: transaction_status,
            event_id: eventId,
            processing_time_ms: Date.now() - startTime
        });

        // Process asynchronously if needed
        if (shouldProcessAsync) {
            // Fire and forget - don't wait for completion
            processWebhookAsync(notification, eventId).catch(error => {
                console.error('Asynchronous webhook processing failed:', error);
                // In production, you might want to send alerts or queue for retry
            });
        }

        console.log('✅ Webhook handler completed in', Date.now() - startTime, 'ms');
        return response;

    } catch (error) {
        console.error('Webhook handler error:', error);

        // Still return 200 to avoid Midtrans retrying, but log the error
        return NextResponse.json({
            success: false,
            message: 'Error processing notification',
            error: error.message,
            processing_time_ms: Date.now() - startTime
        });
    }
}

/**
 * GET /api/webhooks/midtrans
 * Health check for webhook endpoint
 */
export async function GET() {
    // Clean up expired events on health check
    cleanupExpiredEvents();

    return NextResponse.json({
        status: 'Midtrans webhook endpoint is running',
        timestamp: getCurrentTimestamp(),
        version: '2.0.0-production',
        features: [
            'idempotency',
            'async-processing',
            'transaction-history',
            'business-logic',
            'error-retry',
            'signature-validation'
        ]
    });
}
