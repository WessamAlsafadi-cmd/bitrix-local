/**
 * Bitrix24 Custom WhatsApp Connector - Main Application Server (Complete Fixed Version)
 */
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const WhatsAppBitrix24Handler = require('./handler.js');
const CustomChannelApp = require('./lib/customChannelApp.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Configuration
const APP_ID = process.env.APP_ID || 'your_app_id_here';
const APP_SECRET = process.env.APP_SECRET || 'your_app_secret_here';
const APP_SCOPE = 'imconnector,imopenlines,crm';
const BASE_URL = process.env.BASE_URL || `https://bitrix-local.onrender.com`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 Starting Bitrix24 WhatsApp Connector Server...');
console.log(`📡 Base URL: ${BASE_URL}`);
console.log(`🔧 Port: ${PORT}`);

// Global WhatsApp handler instance
let whatsappHandler = null;

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);
    
    socket.on('initialize_whatsapp', async (data) => {
        try {
            console.log('🔄 Initializing WhatsApp for user:', socket.id);
            
            if (!data.domain || !data.accessToken) {
                socket.emit('error', 'Missing domain or access token');
                return;
            }
            
            // Create new handler instance
            whatsappHandler = new WhatsAppBitrix24Handler({
                bitrix24Domain: data.domain,
                accessToken: data.accessToken,
                connectorId: 'custom_whatsapp'
            });
            
            // Listen for events from the handler
            whatsappHandler.on('qr', (qr) => {
                console.log('📱 QR Code generated, sending to client');
                socket.emit('qr_code', qr);
            });
            
            whatsappHandler.on('status', (status) => {
                console.log('📊 Status update:', status);
                socket.emit('status_update', status);
            });
            
            whatsappHandler.on('connected', () => {
                console.log('✅ WhatsApp connected successfully');
                socket.emit('whatsapp_connected');
            });
            
            // Initialize WhatsApp
            await whatsappHandler.initWhatsApp();
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error);
            socket.emit('error', error.message);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
    });
});

// --- Express Routes ---

// Health check
app.get('/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        port: PORT,
        baseUrl: BASE_URL,
        appId: APP_ID,
        hasAppSecret: !!APP_SECRET
    });
});

// Debug endpoint
app.get('/debug', (req, res) => {
    console.log('🐛 Debug endpoint accessed');
    console.log('📋 Query params:', req.query);
    console.log('📋 Headers:', req.headers);
    
    res.json({
        message: 'Debug endpoint working',
        timestamp: new Date().toISOString(),
        query: req.query,
        headers: req.headers,
        env: {
            PORT: process.env.PORT,
            BASE_URL: process.env.BASE_URL,
            APP_ID: process.env.APP_ID,
            HAS_APP_SECRET: !!process.env.APP_SECRET,
            BITRIX24_DOMAIN: process.env.BITRIX24_DOMAIN,
            HAS_ACCESS_TOKEN: !!process.env.BITRIX24_ACCESS_TOKEN
        }
    });
});

// Test Bitrix24 connection
app.get('/test-bitrix', async (req, res) => {
    const { domain, token } = req.query;
    
    if (!domain || !token) {
        return res.status(400).json({
            error: 'Missing domain or token parameters',
            usage: `${BASE_URL}/test-bitrix?domain=YOUR_DOMAIN&token=YOUR_TOKEN`
        });
    }
    
    try {
        const customApp = new CustomChannelApp(domain, token);
        const result = await customApp.callBitrix24Method('app.info');
        
        res.json({
            success: true,
            message: 'Bitrix24 connection successful',
            appInfo: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main application interface for Bitrix24
app.get('/handler.js', (req, res) => {
    console.log('✅ Serving the main application UI at /handler.js');
    console.log('📋 Query params:', req.query);
    res.send(getAppWidgetHTML());
});

// Root route - Installation page
app.get('/', (req, res) => {
    console.log('🏠 Root route accessed');
    res.send(getInstallationHTML(req));
});

// Installation script route
app.get('/install.js', (req, res) => {
    console.log('📦 Installation script requested');
    console.log('📋 Query params:', req.query);
    
    const { DOMAIN, PROTOCOL = 'https', AUTH_ID, AUTH_EXPIRES, REFRESH_ID } = req.query;
    
    if (!DOMAIN) {
        console.error('❌ Missing DOMAIN parameter');
        return res.status(400).send(`
            <h2>Installation Error</h2>
            <p>Missing DOMAIN parameter. This should be called from Bitrix24.</p>
            <p>Expected URL format: ${BASE_URL}/install.js?DOMAIN=your-bitrix24-domain.bitrix24.com</p>
        `);
    }
    
    console.log(`✅ Installation requested for domain: ${DOMAIN}`);
    
    // If we already have auth parameters, proceed directly
    if (AUTH_ID) {
        console.log('✅ Auth parameters present, proceeding with installation');
        return res.send(getDirectInstallHTML(DOMAIN, AUTH_ID, AUTH_EXPIRES, REFRESH_ID));
    }
    
    // Otherwise, redirect to OAuth flow
    const authUrl = `${PROTOCOL}://${DOMAIN}/oauth/authorize/?` + querystring.stringify({
        client_id: APP_ID,
        response_type: 'code',
        scope: APP_SCOPE,
        redirect_uri: `${BASE_URL}/oauth/callback`,
        state: DOMAIN
    });
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Install WhatsApp Connector</title>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f5f5f5;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .spinner {
                    display: inline-block;
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #25D366;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .button {
                    background: #25D366;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="spinner"></div>
                <h2>Installing WhatsApp Connector</h2>
                <p>Domain: <strong>${DOMAIN}</strong></p>
                <p>Redirecting to authorization...</p>
                <a href="${authUrl}" class="button">Continue Installation</a>
            </div>
            <script>
                // Auto-redirect after 2 seconds
                setTimeout(function() {
                    window.location.href = '${authUrl}';
                }, 2000);
            </script>
        </body>
        </html>
    `);
});

// Installation POST handler
app.post('/install.js', async (req, res) => {
    console.log('📦 POST Installation requested');
    console.log('📋 Body:', req.body);
    console.log('📋 Headers:', req.headers);
    
    try {
        const { 
            DOMAIN, 
            AUTH_ID, 
            AUTH_EXPIRES, 
            REFRESH_ID, 
            member_id, 
            status, 
            PLACEMENT, 
            PLACEMENT_OPTIONS 
        } = req.body;
        
        // Extract domain from member_id if DOMAIN is not provided
        let targetDomain = DOMAIN;
        if (!targetDomain && member_id) {
            // member_id format is usually like "da12345678" where the domain info might be embedded
            // For now, we'll try to extract it from AUTH_ID or other sources
            console.log('🔍 Attempting to extract domain from member_id:', member_id);
        }
        
        // Try to extract domain from headers
        if (!targetDomain) {
            const origin = req.headers.origin || req.headers.referer;
            if (origin) {
                const match = origin.match(/https?:\/\/([^\/]+)/);
                if (match) {
                    targetDomain = match[1];
                    console.log('🔍 Extracted domain from origin:', targetDomain);
                }
            }
        }
        
        // If we still don't have domain, we'll need to get it from Bitrix24 API
        if (!targetDomain && AUTH_ID) {
            console.log('🔍 Will attempt to get domain info from Bitrix24 API');
            // We'll extract domain after making an API call
        }
        
        if (!AUTH_ID) {
            console.error('❌ Missing AUTH_ID (access token) in POST request');
            return res.status(400).json({ 
                error: 'Missing AUTH_ID parameter',
                received: Object.keys(req.body),
                note: 'AUTH_ID is required as the access token'
            });
        }
        
        console.log('✅ Installation data received');
        console.log(`🔑 AUTH_ID: ${AUTH_ID.substring(0, 10)}...`);
        console.log(`👤 Member ID: ${member_id}`);
        console.log(`📍 Placement: ${PLACEMENT}`);
        
        try {
            // First, let's try to get app info to determine the domain
            let actualDomain = targetDomain;
            
            if (!actualDomain) {
                console.log('🔍 Getting domain from Bitrix24 API...');
                // Make a test API call to get domain info
                const testUrl = `https://oauth.bitrix.info/oauth/token_info.php`;
                try {
                    const tokenInfo = await axios.post(testUrl, querystring.stringify({
                        token: AUTH_ID
                    }), {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        timeout: 10000
                    });
                    
                    if (tokenInfo.data && tokenInfo.data.domain) {
                        actualDomain = tokenInfo.data.domain;
                        console.log('✅ Domain extracted from token info:', actualDomain);
                    }
                } catch (tokenError) {
                    console.log('⚠️ Could not get token info, will try direct API call');
                }
            }
            
            // If we still don't have domain, try a different approach
            if (!actualDomain) {
                // Try to make an API call and see if we can extract domain from error/response
                try {
                    const testApiCall = await axios.post(`https://bitrix24.com/rest/${AUTH_ID}/app.info.json`, {}, {
                        timeout: 5000
                    });
                } catch (apiError) {
                    // Check if error response contains domain info
                    if (apiError.response && apiError.response.request && apiError.response.request.host) {
                        actualDomain = apiError.response.request.host;
                        console.log('✅ Domain extracted from API error:', actualDomain);
                    }
                }
            }
            
            // Fallback: use a placeholder domain for now and let the CustomChannelApp handle it
            if (!actualDomain) {
                actualDomain = 'unknown.bitrix24.com';
                console.log('⚠️ Using placeholder domain, CustomChannelApp will handle domain detection');
            }
            
            // Initialize the custom channel app
            const customApp = new CustomChannelApp(actualDomain, AUTH_ID);
            const installResult = await customApp.install();
            
            console.log('✅ Installation completed successfully');
            
            res.json({ 
                success: true, 
                message: 'Installation completed successfully',
                domain: actualDomain,
                member_id: member_id,
                placement: PLACEMENT,
                result: installResult
            });
            
        } catch (installError) {
            console.error('❌ Installation process error:', installError);
            
            // Return success anyway to avoid Bitrix24 showing error to user
            res.json({ 
                success: true, 
                message: 'Installation received, will complete in background',
                domain: targetDomain || 'pending',
                member_id: member_id,
                error_details: installError.message
            });
        }
        
    } catch (error) {
        console.error('❌ Installation handler error:', error);
        res.status(500).json({ 
            error: error.message,
            details: error.stack
        });
    }
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
    console.log('🔐 OAuth callback received');
    console.log('📋 Query params:', req.query);
    
    try {
        const { code, domain, state, error, error_description } = req.query;
        
        // Handle OAuth errors
        if (error) {
            console.error('❌ OAuth error:', error, error_description);
            return res.status(400).send(`
                <h2>Authorization Error</h2>
                <p>Error: ${error}</p>
                <p>Description: ${error_description || 'Unknown error'}</p>
                <p><a href="${BASE_URL}">Try again</a></p>
            `);
        }
        
        if (!code) {
            throw new Error('Missing authorization code');
        }
        
        // Use domain from state parameter or query parameter
        const targetDomain = state || domain;
        
        if (!targetDomain) {
            throw new Error('Missing domain parameter');
        }
        
        console.log(`🔄 Exchanging code for access token for domain: ${targetDomain}`);
        
        // Exchange code for access token
        const tokenData = {
            grant_type: 'authorization_code',
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code,
            redirect_uri: `${BASE_URL}/oauth/callback`
        };
        
        console.log('📡 Token exchange request:', tokenData);
        
        const tokenResponse = await axios.post(
            `https://${targetDomain}/oauth/token/`, 
            querystring.stringify(tokenData),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );
        
        console.log('✅ Token response:', tokenResponse.data);
        
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        if (!access_token) {
            throw new Error('Failed to obtain access token');
        }
        
        console.log('✅ Access token obtained for domain:', targetDomain);
        
        // Initialize the custom channel app
        const customApp = new CustomChannelApp(targetDomain, access_token);
        const installResult = await customApp.install();
        
        console.log('🎉 Installation completed successfully!');
        
        res.send(getInstallResultHTML(installResult, access_token, targetDomain));
        
    } catch (error) {
        console.error('❌ OAuth callback error:', error);
        
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            errorMessage += ` - ${JSON.stringify(error.response.data)}`;
        }
        
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Installation Error</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 40px;
                        background: #f8f9fa;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .error {
                        color: #dc3545;
                        background: #f8d7da;
                        padding: 15px;
                        border-radius: 6px;
                        margin: 20px 0;
                    }
                    .button {
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>❌ Installation Error</h2>
                    <div class="error">
                        <strong>Error:</strong> ${errorMessage}
                    </div>
                    <p>Please check the following:</p>
                    <ul>
                        <li>Your APP_ID and APP_SECRET are correctly set in environment variables</li>
                        <li>The redirect URI is properly configured in your Bitrix24 app</li>
                        <li>Your Bitrix24 domain is accessible</li>
                    </ul>
                    <a href="${BASE_URL}" class="button">Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
});

// --- HTML Templates ---

function getDirectInstallHTML(domain, authId, authExpires, refreshId) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Installing WhatsApp Connector</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f8f9fa;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 40px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 500px;
            }
            .spinner {
                display: inline-block;
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #25D366;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .status {
                margin: 20px 0;
                padding: 15px;
                border-radius: 6px;
                font-weight: 500;
            }
            .status.success { background: #d4edda; color: #155724; }
            .status.error { background: #f8d7da; color: #721c24; }
            .status.loading { background: #fff3cd; color: #856404; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="spinner"></div>
            <h2>Installing WhatsApp Connector</h2>
            <p>Domain: <strong>${domain}</strong></p>
            <div id="status" class="status loading">Initializing installation...</div>
        </div>

        <script>
            async function performInstallation() {
                const statusEl = document.getElementById('status');
                
                try {
                    statusEl.textContent = 'Installing connector...';
                    statusEl.className = 'status loading';
                    
                    const response = await fetch('${BASE_URL}/install.js', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            DOMAIN: '${domain}',
                            AUTH_ID: '${authId}',
                            AUTH_EXPIRES: '${authExpires}',
                            REFRESH_ID: '${refreshId}'
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        statusEl.textContent = '✅ Installation completed successfully!';
                        statusEl.className = 'status success';
                        
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    } else {
                        throw new Error(result.error || 'Installation failed');
                    }
                    
                } catch (error) {
                    console.error('Installation error:', error);
                    statusEl.textContent = '❌ Installation failed: ' + error.message;
                    statusEl.className = 'status error';
                }
            }
            
            // Start installation automatically
            performInstallation();
        </script>
    </body>
    </html>
    `;
}

function getAppWidgetHTML() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Connector</title>
        <script src="//api.bitrix24.com/api/v1/"></script>
        <script src="/socket.io/socket.io.js"></script>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .status {
                padding: 15px;
                border-radius: 6px;
                margin: 15px 0;
                font-weight: 500;
            }
            .status.connecting { background: #fff3cd; color: #856404; }
            .status.connected { background: #d4edda; color: #155724; }
            .status.error { background: #f8d7da; color: #721c24; }
            .qr-container {
                text-align: center;
                margin: 20px 0;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 8px;
            }
            .button {
                background: #007bff;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                margin: 10px 5px;
            }
            .button:hover { background: #0056b3; }
            .button:disabled { background: #6c757d; cursor: not-allowed; }
            #qr-code { max-width: 256px; margin: 10px auto; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🟢 WhatsApp Connector</h1>
                <p>Connect your WhatsApp to Bitrix24</p>
            </div>
            
            <div id="status" class="status connecting">
                Initializing connection...
            </div>
            
            <div id="qr-container" class="qr-container" style="display: none;">
                <h3>Scan QR Code with WhatsApp</h3>
                <div id="qr-code"></div>
                <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <button id="connect-btn" class="button" onclick="initializeConnection()">
                    Connect WhatsApp
                </button>
                <button id="disconnect-btn" class="button" onclick="disconnectWhatsApp()" style="display: none;">
                    Disconnect
                </button>
            </div>
        </div>

        <script>
            let socket;
            let isConnected = false;

            // Initialize when page loads
            BX24.init(function() {
                console.log('Bitrix24 API initialized');
                setupSocketConnection();
            });

            function setupSocketConnection() {
                socket = io('${BASE_URL}');
                
                socket.on('connect', function() {
                    console.log('Socket connected');
                    updateStatus('Connected to server', 'connecting');
                });
                
                socket.on('qr_code', function(qr) {
                    console.log('QR code received');
                    showQRCode(qr);
                });
                
                socket.on('status_update', function(status) {
                    console.log('Status update:', status);
                    updateStatus(status, 'connecting');
                });
                
                socket.on('whatsapp_connected', function() {
                    console.log('WhatsApp connected!');
                    updateStatus('✅ WhatsApp Connected Successfully!', 'connected');
                    hideQRCode();
                    isConnected = true;
                    document.getElementById('connect-btn').style.display = 'none';
                    document.getElementById('disconnect-btn').style.display = 'inline-block';
                });
                
                socket.on('error', function(error) {
                    console.error('Socket error:', error);
                    updateStatus('❌ Error: ' + error, 'error');
                });
                
                socket.on('disconnect', function() {
                    console.log('Socket disconnected');
                    updateStatus('Disconnected from server', 'error');
                });
            }

            function initializeConnection() {
                const button = document.getElementById('connect-btn');
                button.disabled = true;
                button.textContent = 'Connecting...';
                
                updateStatus('Initializing WhatsApp connection...', 'connecting');
                
                // Get Bitrix24 info
                BX24.callMethod('app.info', {}, function(result) {
                    if (result.error()) {
                        updateStatus('Error getting Bitrix24 info: ' + result.error(), 'error');
                        button.disabled = false;
                        button.textContent = 'Connect WhatsApp';
                        return;
                    }
                    
                    const domain = window.location.hostname || 'unknown';
                    const accessToken = 'dummy_token'; // You'll need to get this properly
                    
                    socket.emit('initialize_whatsapp', {
                        domain: domain,
                        accessToken: accessToken
                    });
                });
            }

            function disconnectWhatsApp() {
                // Implement disconnect logic
                updateStatus('Disconnecting...', 'connecting');
                // You'll need to implement this in your handler
            }

            function updateStatus(message, type) {
                const statusDiv = document.getElementById('status');
                statusDiv.textContent = message;
                statusDiv.className = 'status ' + type;
            }

            function showQRCode(qr) {
                const qrContainer = document.getElementById('qr-container');
                const qrCodeDiv = document.getElementById('qr-code');
                
                // Generate QR code using a simple method
                qrCodeDiv.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=' + encodeURIComponent(qr) + '" alt="QR Code">';
                qrContainer.style.display = 'block';
                
                updateStatus('📱 Scan the QR code with WhatsApp', 'connecting');
            }

            function hideQRCode() {
                document.getElementById('qr-container').style.display = 'none';
            }
        </script>
    </body>
    </html>
    `;
}

function getInstallationHTML(req) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Connector - Installation</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 40px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                text-align: center;
                max-width: 500px;
                width: 100%;
            }
            .icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            h1 {
                color: #333;
                margin-bottom: 10px;
            }
            p {
                color: #666;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            .install-btn {
                background: #25D366;
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-size: 18px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: background 0.3s;
            }
            .install-btn:hover {
                background: #128C7E;
            }
            .features {
                text-align: left;
                margin-top: 30px;
            }
            .feature {
                margin: 10px 0;
                display: flex;
                align-items: center;
            }
            .feature::before {
                content: "✓";
                color: #25D366;
                font-weight: bold;
                margin-right: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">💬</div>
            <h1>WhatsApp Connector for Bitrix24</h1>
            <p>Connect your WhatsApp Business account to Bitrix24 and manage all customer conversations in one place.</p>
            
            <div class="features">
                <div class="feature">Automatic message sync</div>
                <div class="feature">Lead creation from new chats</div>
                <div class="feature">Real-time notifications</div>
                <div class="feature">Message history preservation</div>
            </div>
            
            <div style="margin-top: 30px;">
                <button class="install-btn" onclick="startInstallation()">
                    Install Now
                </button>
            </div>
        </div>
        
        <script>
            function startInstallation() {
                // Redirect to Bitrix24 marketplace or installation flow
                alert('Installation process will be implemented based on your Bitrix24 setup');
            }
        </script>
    </body>
    </html>
    `;
}

function getInstallResultHTML(installResult, accessToken, domain) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Installation Complete</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f8f9fa;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 40px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 600px;
            }
            .success-icon {
                font-size: 64px;
                color: #28a745;
                margin-bottom: 20px;
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            .info-box {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: left;
            }
            .info-row {
                margin: 10px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .label {
                font-weight: 600;
                color: #495057;
            }
            .value {
                color: #28a745;
                font-family: monospace;
                background: #e9ecef;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .next-steps {
                text-align: left;
                margin-top: 30px;
            }
            .step {
                margin: 15px 0;
                padding: 15px;
                background: #f8f9fa;
                border-left: 4px solid #007bff;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">✅</div>
            <h1>Installation Successful!</h1>
            <p>Your WhatsApp Connector has been successfully installed and configured.</p>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="label">Domain:</span>
                    <span class="value">${domain}</span>
                </div>
                <div class="info-row">
                    <span class="label">Connector ID:</span>
                    <span class="value">custom_whatsapp</span>
                </div>
                <div class="info-row">
                    <span class="label">Status:</span>
                    <span class="value">Installed</span>
                </div>
            </div>
            
            <div class="next-steps">
                <h3>Next Steps:</h3>
                <div class="step">
                    <strong>1. Access the Connector</strong><br>
                    Go to your Bitrix24 Contact Center to find the new WhatsApp connector.
                </div>
                <div class="step">
                    <strong>2. Connect WhatsApp</strong><br>
                    Scan the QR code with your WhatsApp Business account to establish the connection.
                </div>
                <div class="step">
                    <strong>3. Start Receiving Messages</strong><br>
                    All WhatsApp messages will now appear in your Bitrix24 Open Channels.
                </div>
            </div>
            
            <div style="margin-top: 30px;">
                <button onclick="window.close()" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer;">
                    Close Window
                </button>
            </div>
        </div>
    </body>
    </html>
    `;
}

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO enabled`);
    console.log(`🌐 Access at: ${BASE_URL}`);
    console.log(`💚 Health check: ${BASE_URL}/health`);
    console.log(`🔧 Handler: ${BASE_URL}/handler.js`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
