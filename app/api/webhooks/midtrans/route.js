import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { google } from 'googleapis';

// Google Sheets API configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || 'YOUR_SPREADSHEET_ID';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'WRP_Registrations';

// Jersey Database Google Sheets configuration
const JERSEY_SPREADSHEET_ID = '1gjNVdzZFaJOoVM7MUgQBN7WS8mxg1btwmXDpnvNrLao';
const JERSEY_SHEET_NAME = 'Sheet1';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

// n8n webhook configuration
const N8N_REGISTRATION_WEBHOOK_URL = process.env.N8N_REGISTRATION_WEBHOOK_URL || 'https://n8n-oo1yqkmi2l7g.blueberry.sumopod.my.id/webhook/f0aae5da-7ca3-4c2c-af78-500367bde5d2';
const N8N_JERSEY_WEBHOOK_URL = process.env.N8N_JERSEY_WEBHOOK_URL || 'https://n8n-oo1yqkmi2l7g.blueberry.sumopod.my.id/webhook/dc687746-6f94-4467-9d94-f4d0704e4eb6';

/**
 * Sends registration payment success notification to n8n webhook
 * @param {Object} paymentData - Payment data from Midtrans
 * @param {Object} registrationData - Registration data from local/sheets
 * @returns {Promise<Object>} - n8n webhook response
 */
async function sendRegistrationSuccessToN8n(paymentData, registrationData) {
    try {
        console.log('Sending registration payment success notification to n8n...');
        
        const webhookPayload = {
            event: 'registration_payment_success',
            timestamp: new Date().toISOString(),
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
}

/**
 * Sends jersey payment success notification to n8n webhook
 * @param {Object} paymentData - Payment data from Midtrans
 * @param {Object} jerseyData - Jersey order data from sheets
 * @returns {Promise<Object>} - n8n webhook response
 */
async function sendJerseySuccessToN8n(paymentData, jerseyData) {
    try {
        console.log('Sending jersey payment success notification to n8n...');
        
        const webhookPayload = {
            event: 'jersey_payment_success',
            timestamp: new Date().toISOString(),
            payment: {
                order_id: paymentData.order_id,
                transaction_status: paymentData.transaction_status,
                payment_type: paymentData.payment_type,
                gross_amount: paymentData.gross_amount,
                fraud_status: paymentData.fraud_status
            },
            jersey: {
                name: jerseyData.name,
                email: jerseyData.email,
                phone: jerseyData.phone,
                jerseySize: jerseyData.jerseySize,
                quantity: jerseyData.quantity,
                fixedPrice: jerseyData.fixedPrice,
                totalAmount: jerseyData.totalAmount || parseInt(paymentData.gross_amount),
                orderDate: jerseyData.orderDate,
                address: jerseyData.address,
                rtRw: jerseyData.rtRw,
                district: jerseyData.district,
                city: jerseyData.city,
                province: jerseyData.province,
                postcode: jerseyData.postcode
            }
        };

        return await sendToN8nWebhook(N8N_JERSEY_WEBHOOK_URL, webhookPayload, 'jersey');

    } catch (error) {
        console.error('Error calling jersey n8n webhook:', error.message);
        return { 
            success: false, 
            error: error.message 
        };
    }
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
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': `WRP-${type}-Webhook/1.0`
        };

        console.log(`Sending to ${type} n8n webhook:`, {
            url: webhookUrl,
            payload: JSON.stringify(payload, null, 2)
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
            console.log(`${type} n8n response:`, responseText);
            return { 
                success: true, 
                status: response.status,
                response: responseText 
            };
        } else {
            console.error(`❌ ${type} n8n webhook failed:`, response.status, responseText);
            return { 
                success: false, 
                status: response.status,
                error: responseText 
            };
        }

    } catch (error) {
        console.error(`Error calling ${type} n8n webhook:`, error.message);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

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
 * Gets registration data from Google Sheets by order ID
 * @param {string} orderId - Midtrans order ID
 * @returns {Promise<Object>} - Registration data or null
 */
async function getRegistrationFromGoogleSheets(orderId) {
    try {
        const sheets = await getGoogleSheetsClient();
        
        // Get all registration data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:AB`, // Get all columns including new complete address field (up to column AB)
        });

        const rows = response.data.values || [];
        console.log(`Searching for order ID: ${orderId} in ${rows.length} rows`);
        
        // Debug: Log the structure of a few rows to understand the data layout
        if (rows.length > 1) {
            console.log('=== DEBUGGING SHEET STRUCTURE ===');
            console.log('Header row (row 0):', rows[0]?.length, 'columns');
            console.log('First data row (row 1) structure:');
            console.log('  Row length:', rows[1]?.length);
            console.log('  Column AA (index 26) - Should be Payment Link:', rows[1]?.[26]);
            console.log('  Column AB (index 27) - Should be Midtrans Order ID:', rows[1]?.[27]);
            console.log('  Column AC (index 28) - Should be empty:', rows[1]?.[28]);
            console.log('=== END DEBUGGING ===');
        }

        // Find registration by midtransOrderId (column AB, index 27) or payment link (column AA, index 26)
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const row = rows[i];
            const rowOrderId = row[27] || ''; // Column AB (0-indexed = 27) - midtransOrderId
            const rowPaymentLink = row[26] || ''; // Column AA (0-indexed = 26) - payment link or link id

            // Helper to build return object for this row
            const buildRegistrationObject = (matchedBy) => ({
                id: row[1] || '', // Column B - Registration ID
                name: row[2] || '', // Column C - Name
                email: row[3] || '', // Column D - Email  
                phone: row[4] || '', // Column E - Phone
                stravaName: row[5] || '', // Column F - Strava Name
                packageType: row[6] || 'basic', // Column G - Package Type
                jerseySize: row[7] || '', // Column H - Jersey Size
                gender: row[8] || '', // Column I - Gender
                completeAddress: row[9] || '', // Column J - Complete Address
                simpleAddress: row[10] || '', // Column K - Simple Address
                fullAddress: {
                    street: row[11] || '', // Column L - Full Address Street
                    rtRw: row[12] || '', // Column M - Full Address RT/RW
                    district: row[13] || '', // Column N - Full Address District
                    city: row[14] || '', // Column O - Full Address City
                    province: row[15] || '', // Column P - Full Address Province
                    postcode: row[16] || '' // Column Q - Full Address Postcode
                },
                baseAmount: parseFloat(row[17]) || 100000, // Column R - Base Amount
                fixedDonation: parseFloat(row[18]) || 0, // Column S - Fixed Donation
                jerseyPrice: parseFloat(row[19]) || 0, // Column T - Jersey Price
                additionalDonation: parseFloat(row[20]) || 0, // Column U - Additional Donation
                registrationDate: row[21] || '', // Column V - Registration Date
                status: row[22] || 'pending', // Column W - Status
                paymentStatus: row[23] || 'pending', // Column X - Payment Status
                totalAmount: parseFloat(row[24]) || 100000, // Column Y - Total Amount
                donationDate: row[25] || '', // Column Z - Donation Date
                paymentLink: rowPaymentLink, // Column AA - Payment Link
                orderId: rowOrderId, // Column AB - Midtrans Order ID
                matchedBy
            });

            // Exact matches first (check both stored orderId and payment link)
            if (rowOrderId && rowOrderId === orderId) {
                console.log(`Found exact match at row ${i + 1} by orderId:`, row);
                return buildRegistrationObject('orderId');
            }

            if (rowPaymentLink && rowPaymentLink === orderId) {
                console.log(`Found exact match at row ${i + 1} by paymentLink:`, row);
                return buildRegistrationObject('paymentLink');
            }

            // Partial matches - received starts with stored (handles Midtrans appended timestamps)
            if (rowOrderId && orderId.startsWith(rowOrderId)) {
                console.log(`Found partial match at row ${i + 1} by orderId: stored="${rowOrderId}", received="${orderId}"`);
                return buildRegistrationObject('orderId-partial');
            }

            if (rowPaymentLink && orderId.startsWith(rowPaymentLink)) {
                console.log(`Found partial match at row ${i + 1} by paymentLink: stored="${rowPaymentLink}", received="${orderId}"`);
                return buildRegistrationObject('paymentLink-partial');
            }

            // Reverse partial matches - stored starts with received
            if (rowOrderId && rowOrderId.startsWith(orderId)) {
                console.log(`Found reverse match at row ${i + 1} by orderId: stored="${rowOrderId}", received="${orderId}"`);
                return buildRegistrationObject('orderId-reverse');
            }

            if (rowPaymentLink && rowPaymentLink.startsWith(orderId)) {
                console.log(`Found reverse match at row ${i + 1} by paymentLink: stored="${rowPaymentLink}", received="${orderId}"`);
                return buildRegistrationObject('paymentLink-reverse');
            }

            // Additional pattern-based matching on base parts
            const receivedParts = orderId.split('-');
            const storedParts = rowOrderId.split('-');
            if (receivedParts.length >= 3 && storedParts.length >= 3) {
                const receivedBase = receivedParts.slice(0, 3).join('-');
                const storedBase = storedParts.slice(0, 3).join('-');
                if (receivedBase === storedBase) {
                    console.log(`Found base pattern match at row ${i + 1} by orderId: receivedBase="${receivedBase}", storedBase="${storedBase}"`);
                    return buildRegistrationObject('orderId-base');
                }
            }
        }

        console.log(`No registration found for order ID: ${orderId}`);
        return null;

    } catch (error) {
        console.error('Error fetching registration from Google Sheets:', error.message);
        return null;
    }
}

/**
 * Gets jersey order data from Jersey Google Sheets by order ID
 * @param {string} orderId - Midtrans order ID
 * @returns {Promise<Object>} - Jersey order data or null
 */
async function getJerseyOrderFromGoogleSheets(orderId) {
    try {
        const sheets = await getGoogleSheetsClient();
        
        // Get all jersey order data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: JERSEY_SPREADSHEET_ID,
            range: `${JERSEY_SHEET_NAME}!A:P`, // Get all columns A to P
        });

        const rows = response.data.values || [];
        console.log(`Searching for jersey order ID: ${orderId} in ${rows.length} rows`);

        // Find jersey order by midtransOrderId (column O, index 14) or payment link (column N, index 13)
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const row = rows[i];
            const rowOrderId = row[14] || ''; // Column O (0-indexed = 14) - Midtrans Order ID
            const rowPaymentLink = row[13] || ''; // Column N (0-indexed = 13) - Payment Link

            const buildJerseyObject = (matchedBy) => ({
                name: row[0] || '', // Column A - Nama
                email: row[1] || '', // Column B - Email
                phone: row[2] || '', // Column C - No. Handphone
                address: row[3] || '', // Column D - Alamat
                rtRw: row[4] || '', // Column E - RW/RW
                district: row[5] || '', // Column F - Kelurahan/Kecamatan
                city: row[6] || '', // Column G - Kota
                province: row[7] || '', // Column H - Provinsi
                postcode: row[8] || '', // Column I - Kode Pos
                jerseySize: row[9] || '', // Column J - Ukuran Jersey
                quantity: parseInt(row[10]) || 1, // Column K - Quantity
                fixedPrice: parseFloat(row[11]) || 0, // Column L - Fixed Price
                totalAmount: parseFloat(row[12]) || 0, // Column M - Total Amount
                paymentLink: rowPaymentLink, // Column N - Payment Link
                orderId: rowOrderId, // Column O - Midtrans Order ID
                paidStatus: row[15] || 'unpaid', // Column P - Paid Status
                rowIndex: i + 1,
                matchedBy
            });

            // Exact matches
            if (rowOrderId && rowOrderId === orderId) {
                console.log(`Found exact jersey order match at row ${i + 1} by orderId:`, row);
                return buildJerseyObject('orderId');
            }

            if (rowPaymentLink && rowPaymentLink === orderId) {
                console.log(`Found exact jersey order match at row ${i + 1} by paymentLink:`, row);
                return buildJerseyObject('paymentLink');
            }

            // Partial or reverse partial matches
            if (rowOrderId && (orderId.startsWith(rowOrderId) || rowOrderId.startsWith(orderId))) {
                console.log(`Found partial jersey order match at row ${i + 1} by orderId: stored="${rowOrderId}", received="${orderId}"`);
                return buildJerseyObject('orderId-partial');
            }

            if (rowPaymentLink && (orderId.startsWith(rowPaymentLink) || rowPaymentLink.startsWith(orderId))) {
                console.log(`Found partial jersey order match at row ${i + 1} by paymentLink: stored="${rowPaymentLink}", received="${orderId}"`);
                return buildJerseyObject('paymentLink-partial');
            }
        }

        console.log(`No jersey order found for order ID: ${orderId}`);
        return null;

    } catch (error) {
        console.error('Error fetching jersey order from Google Sheets:', error.message);
        return null;
    }
}

/**
 * Updates jersey order status in Google Sheets
 * @param {string} orderId - Midtrans order ID
 * @param {string} newStatus - New paid status ('paid' or 'unpaid')
 * @returns {Promise<Object>} - Update result
 */
async function updateJerseyOrderInGoogleSheets(orderId, newStatus) {
    try {
        console.log('Updating Jersey Google Sheets for order:', orderId, 'status:', newStatus);
        
        const sheets = await getGoogleSheetsClient();
        
        // Get all data to find the row with matching order ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: JERSEY_SPREADSHEET_ID,
            range: `${JERSEY_SHEET_NAME}!A:P`,
        });

        const rows = response.data.values || [];
        let targetRowIndex = -1;

        // Find the row with matching order ID or payment link
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const midtransOrderId = rows[i][14] || ''; // Column O (index 14) - Midtrans Order ID
            const paymentLink = rows[i][13] || ''; // Column N (index 13) - Payment Link

            if (midtransOrderId && (midtransOrderId === orderId || orderId.startsWith(midtransOrderId) || midtransOrderId.startsWith(orderId))) {
                targetRowIndex = i + 1; // Google Sheets is 1-indexed
                console.log(`✅ Found jersey order to update at row ${targetRowIndex} by orderId`);
                break;
            }

            if (paymentLink && (paymentLink === orderId || orderId.startsWith(paymentLink) || paymentLink.startsWith(orderId))) {
                targetRowIndex = i + 1;
                console.log(`✅ Found jersey order to update at row ${targetRowIndex} by paymentLink`);
                break;
            }
        }

        if (targetRowIndex === -1) {
            console.log('❌ Jersey order ID not found in sheet:', orderId);
            return { success: false, message: 'Jersey order ID not found in sheet' };
        }

        // Update paid status in column P
        const updateResult = await sheets.spreadsheets.values.update({
            spreadsheetId: JERSEY_SPREADSHEET_ID,
            range: `${JERSEY_SHEET_NAME}!P${targetRowIndex}`, // Paid Status column (column P)
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[newStatus]]
            }
        });

        console.log(`✅ Successfully updated jersey order status: ${orderId} -> ${newStatus}`);
        return { 
            success: true, 
            message: 'Jersey order status updated successfully',
            updatedRow: targetRowIndex,
            newStatus: newStatus
        };

    } catch (error) {
        console.error('Error updating jersey order in Google Sheets:', error.message);
        return { 
            success: false, 
            message: 'Failed to update jersey order status',
            error: error.message
        };
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
            range: `${SHEET_NAME}!A:AB`, // Get all columns (now AB columns with complete address field)
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
            console.log('No data found in sheet');
            return { success: false, message: 'No data found in sheet' };
        }

        // Find the row with matching Midtrans Order ID (column AA, index 26)
        // Handle both exact matches and partial matches (in case Midtrans appends timestamps)
        let targetRowIndex = -1;
        let foundOrderId = null;
        
        console.log(`Searching for order ID: "${orderId}" in ${rows.length - 1} rows`);
        
        for (let i = 1; i < rows.length; i++) { // Skip header row
            const midtransOrderId = rows[i][27] || ''; // Column AB (index 27) - Midtrans Order ID
            const paymentLink = rows[i][26] || ''; // Column AA (index 26) - Payment Link

            console.log(`Row ${i}: Comparing storedOrderId="${midtransOrderId}" storedPaymentLink="${paymentLink}" with received="${orderId}"`);

            // Exact matches first
            if (midtransOrderId && midtransOrderId === orderId) {
                targetRowIndex = i + 1;
                foundOrderId = midtransOrderId;
                console.log(`✅ Found exact match at row ${targetRowIndex} by orderId`);
                break;
            }

            if (paymentLink && paymentLink === orderId) {
                targetRowIndex = i + 1;
                foundOrderId = paymentLink;
                console.log(`✅ Found exact match at row ${targetRowIndex} by paymentLink`);
                break;
            }

            // Partial matches (received starts with stored)
            if (midtransOrderId && orderId.startsWith(midtransOrderId)) {
                targetRowIndex = i + 1;
                foundOrderId = midtransOrderId;
                console.log(`✅ Found partial match (received starts with stored) at row ${targetRowIndex} by orderId: stored="${midtransOrderId}", received="${orderId}"`);
                break;
            }

            if (paymentLink && orderId.startsWith(paymentLink)) {
                targetRowIndex = i + 1;
                foundOrderId = paymentLink;
                console.log(`✅ Found partial match (received starts with stored) at row ${targetRowIndex} by paymentLink: stored="${paymentLink}", received="${orderId}"`);
                break;
            }

            // Reverse matches (stored starts with received)
            if (midtransOrderId && midtransOrderId.startsWith(orderId)) {
                targetRowIndex = i + 1;
                foundOrderId = midtransOrderId;
                console.log(`✅ Found reverse match (stored starts with received) at row ${targetRowIndex} by orderId: stored="${midtransOrderId}", received="${orderId}"`);
                break;
            }

            if (paymentLink && paymentLink.startsWith(orderId)) {
                targetRowIndex = i + 1;
                foundOrderId = paymentLink;
                console.log(`✅ Found reverse match (stored starts with received) at row ${targetRowIndex} by paymentLink: stored="${paymentLink}", received="${orderId}"`);
                break;
            }

            // Additional base-pattern matching for midtransOrderId
            if (midtransOrderId) {
                const receivedParts = orderId.split('-');
                const storedParts = midtransOrderId.split('-');
                if (receivedParts.length >= 3 && storedParts.length >= 3) {
                    const receivedBase = receivedParts.slice(0, 3).join('-');
                    const storedBase = storedParts.slice(0, 3).join('-');
                    if (receivedBase === storedBase) {
                        targetRowIndex = i + 1;
                        foundOrderId = midtransOrderId;
                        console.log(`✅ Found base pattern match at row ${targetRowIndex} by orderId: receivedBase="${receivedBase}", storedBase="${storedBase}"`);
                        break;
                    }
                }
            }
        }

        if (targetRowIndex === -1) {
            console.log('❌ Order ID not found in sheet:', orderId);
            console.log('Available order IDs in sheet:');
            for (let i = 1; i < Math.min(rows.length, 10); i++) { // Show first 10 for debugging
                const midtransOrderId = rows[i][27]; // Column AB (index 27) - Midtrans Order ID
                if (midtransOrderId) {
                    console.log(`  Row ${i + 1}: "${midtransOrderId}"`);
                } else {
                    console.log(`  Row ${i + 1}: <empty or undefined>`);
                }
            }
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

        // Update status (column V) and payment status (column W)
        const updates = [
            {
                range: `${SHEET_NAME}!W${targetRowIndex}`, // Status column (was V, now W due to complete address column)
                values: [[newStatus]]
            },
            {
                range: `${SHEET_NAME}!X${targetRowIndex}`, // Payment Status column (was W, now X due to complete address column)
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
                
                // Then try partial match - check if the received order ID starts with the stored order ID
                if (orderId.startsWith(reg.midtransOrderId)) {
                    registrationIndex = i;
                    foundOrderId = reg.midtransOrderId;
                    console.log(`Found partial match in local: stored="${reg.midtransOrderId}", received="${orderId}"`);
                    break;
                }
                
                // Also try reverse match - check if stored order ID starts with received order ID
                if (reg.midtransOrderId.startsWith(orderId)) {
                    registrationIndex = i;
                    foundOrderId = reg.midtransOrderId;
                    console.log(`Found reverse match in local: stored="${reg.midtransOrderId}", received="${orderId}"`);
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
            gross_amount,
            orderIdLength: order_id ? order_id.length : 0,
            orderIdPattern: order_id ? order_id.split('-') : []
        });

        // Handle different transaction statuses
        let shouldUpdateStatus = true;
        
        // Check for fraud
        // 'challenge' means manual review required -> skip automatic updates
        // 'deny' means the transaction was denied by Midtrans; treat as a failed payment and process updates
        if (fraud_status === 'challenge') {
            console.log('Transaction flagged for review (challenge): skipping automatic updates:', fraud_status);
            shouldUpdateStatus = false;
        } else if (fraud_status === 'deny') {
            console.log('Transaction denied by Midtrans (deny). Will process as failed payment and update records accordingly.');
            // Leave shouldUpdateStatus true so the normal failure handling runs
        }

        if (shouldUpdateStatus) {
            // First, try to find in registration database
            let isRegistrationOrder = false;
            let isJerseyOrder = false;
            let registrationData = null;
            let jerseyOrderData = null;

            // Check if this is a registration order
            console.log('🔍 Checking registration database...');
            const registrationCheck = await getRegistrationFromGoogleSheets(order_id);
            if (registrationCheck) {
                isRegistrationOrder = true;
                registrationData = registrationCheck;
                console.log('✅ Found in registration database');
            } else {
                console.log('❌ Not found in registration database');
            }

            // Check if this is a jersey order
            console.log('🔍 Checking jersey database...');
            const jerseyCheck = await getJerseyOrderFromGoogleSheets(order_id);
            if (jerseyCheck) {
                isJerseyOrder = true;
                jerseyOrderData = jerseyCheck;
                console.log('✅ Found in jersey database');
            } else {
                console.log('❌ Not found in jersey database');
            }

            // Process based on what type of order this is
            let localResult = { success: false };
            let sheetsResult = { success: false };
            let jerseyResult = { success: false };

            if (isRegistrationOrder) {
                console.log('📝 Processing as registration order...');
                // Update local registration file
                localResult = await updateLocalRegistration(order_id, transaction_status, payment_type);
                console.log('Local registration update result:', localResult);

                // Update registration Google Sheets
                sheetsResult = await updateRegistrationInGoogleSheets(order_id, transaction_status, payment_type);
                console.log('Registration sheets update result:', sheetsResult);
            }

            if (isJerseyOrder) {
                console.log('👕 Processing as jersey order...');
                // Determine new paid status based on transaction status
                let newPaidStatus = 'unpaid';
                
                switch (transaction_status) {
                    case 'capture':
                    case 'settlement':
                        newPaidStatus = 'paid';
                        break;
                    case 'pending':
                    case 'expire':
                    case 'cancel':
                    case 'deny':
                        newPaidStatus = 'unpaid';
                        break;
                    default:
                        newPaidStatus = 'unpaid';
                        break;
                }

                // Update jersey order status
                jerseyResult = await updateJerseyOrderInGoogleSheets(order_id, newPaidStatus);
                console.log('Jersey order update result:', jerseyResult);
            }

            // If no order found in either database
            if (!isRegistrationOrder && !isJerseyOrder) {
                console.warn('⚠️ Order ID not found in any database:', order_id);
            }

            // Call appropriate n8n webhook for successful payments
            if ((transaction_status === 'capture' || transaction_status === 'settlement') && 
                (localResult.success || sheetsResult.success || jerseyResult.success)) {
                
                console.log('🎉 Payment successful, calling appropriate n8n webhook...');
                
                // Call registration webhook if this is a registration payment
                if (isRegistrationOrder && registrationData) {
                    console.log('📝 Calling registration n8n webhook...');
                    const registrationN8nResult = await sendRegistrationSuccessToN8n(notification, registrationData);
                    console.log('Registration n8n webhook result:', registrationN8nResult);
                    
                    if (registrationN8nResult.success) {
                        console.log('✅ Registration n8n notification sent successfully');
                    } else {
                        console.warn('⚠️ Registration n8n notification failed, but continuing...');
                    }
                }
                
                // Call jersey webhook if this is a jersey payment
                if (isJerseyOrder && jerseyOrderData) {
                    console.log('👕 Calling jersey n8n webhook...');
                    const jerseyN8nResult = await sendJerseySuccessToN8n(notification, jerseyOrderData);
                    console.log('Jersey n8n webhook result:', jerseyN8nResult);
                    
                    if (jerseyN8nResult.success) {
                        console.log('✅ Jersey n8n notification sent successfully');
                    } else {
                        console.warn('⚠️ Jersey n8n notification failed, but continuing...');
                    }
                }
            }

            // Log the results
            const anySuccess = localResult.success || sheetsResult.success || jerseyResult.success;
            if (anySuccess) {
                console.log('✅ Order processed successfully:', {
                    registration: { local: localResult.success, sheets: sheetsResult.success },
                    jersey: jerseyResult.success
                });
            } else {
                console.warn('⚠️ No successful updates:', {
                    registration: { local: localResult.success, sheets: sheetsResult.success },
                    jersey: jerseyResult.success
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
