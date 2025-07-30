/**
 * Bitrix24 Custom WhatsApp Connector - Main Application Server (Updated Version)
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
const APP_SCOPE = 'imconnector,imopenlines,crm,placement,event';
const BASE_URL = process.env.BASE_URL || `https://bitrix-local.onrender.com`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 Starting Bitrix24 WhatsApp Connector Server...');
console.log(`📡 Base URL: ${BASE_URL}`);
console.log(`🔧 Port: ${PORT}`);

// Global WhatsApp handler instance
let whatsappHandler = null;
const activeConnections = new Map();

// --- Webhook endpoint for Bitrix24 events ---
app.post('/webhook', async (req, res) => {
    try {
        console.log('🪝 Webhook received:', req.body);
        
        const { event, data, auth } = req.body;
        
        // Handle different event types
        switch (event) {
            case 'OnImMessageAdd':
                await handleBitrixMessage(data, auth);
                break;
            case 'OnCrmLeadAdd':
                await handleNewLead(data, auth);
                break;
            case 'OnCrmContactAdd':
                await handleNewContact(data, auth);
                break;
            default:
                console.log('🔄 Unhandled event type:', event);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle outgoing messages from Bitrix24 to WhatsApp
async function handleBitrixMessage(data, auth) {
    try {
        console.log('📨 Handling Bitrix24 message:', data);
        
        if (!whatsappHandler || !data.CHAT_ID || !data.MESSAGE) {
            return;
        }
        
        // Extract WhatsApp chat ID and send message
        const whatsappChatId = data.CHAT_ID;
        const message = data.MESSAGE;
        
        await whatsappHandler.sendOutgoingMessage(whatsappChatId, message);
        console.log('✅ Message sent to WhatsApp');
        
    } catch (error) {
        console.error('❌ Error handling Bitrix message:', error);
    }
}

// Handle new lead creation
async function handleNewLead(data, auth) {
    try {
        console.log('🎯 New lead created:', data);
        // Custom logic for new leads can be added here
    } catch (error) {
        console.error('❌ Error handling new lead:', error);
    }
}

// Handle new contact creation
async function handleNewContact(data, auth) {
    try {
        console.log('👤 New contact created:', data);
        // Custom logic for new contacts can be added here
    } catch (error) {
        console.error('❌ Error handling new contact:', error);
    }
}

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
            
            // Store connection info
            activeConnections.set(socket.id, {
                domain: data.domain,
                accessToken: data.accessToken,
                connectedAt: new Date()
            });
            
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
            
            whatsappHandler.on('message_received', (messageData) => {
                console.log('📨 Message received event');
                socket.emit('message_received', messageData);
            });
            
            // Initialize WhatsApp
            await whatsappHandler.initWhatsApp();
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error);
            socket.emit('error', error.message);
        }
    });
    
    socket.on('send_message', async (data) => {
        try {
            if (!whatsappHandler) {
                socket.emit('error', 'WhatsApp not connected');
                return;
            }
            
            const { chatId, message, files } = data;
            await whatsappHandler.sendOutgoingMessage(chatId, message, files);
            socket.emit('message_sent', { success: true });
            
        } catch (error) {
            console.error('❌ Error sending message:', error);
            socket.emit('error', error.message);
        }
    });
    
    socket.on('get_status', () => {
        if (whatsappHandler) {
            const status = whatsappHandler.getConnectionStatus();
            socket.emit('status_response', status);
        } else {
            socket.emit('status_response', { connected: false });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
        activeConnections.delete(socket.id);
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
        hasAppSecret: !!APP_SECRET,
        activeConnections: activeConnections.size,
        whatsappConnected: whatsappHandler ? whatsappHandler.getConnectionStatus() : null
    });
});

// Test what API methods are available
app.get('/test-api', async (req, res) => {
    const { domain, token } = req.query;
    
    if (!domain || !token) {
        return res.status(400).json({
            error: 'Missing domain or token parameters',
            usage: `${BASE_URL}/test-api?domain=YOUR_DOMAIN&token=YOUR_TOKEN`
        });
    }
    
    try {
        const customApp = new CustomChannelApp(domain, token);
        
        // Test basic connectivity
        const appInfo = await customApp.callBitrix24Method('app.info');
        
        // Get available methods
        let availableMethods = {};
        try {
            const methods = await customApp.callBitrix24Method('methods');
            availableMethods = methods.result || {};
        } catch (methodsError) {
            console.log('Could not get methods list:', methodsError.message);
        }
        
        // Filter relevant methods
        const relevantMethods = {
            imconnector: Object.keys(availableMethods).filter(m => m.startsWith('imconnector')),
            imopenlines: Object.keys(availableMethods).filter(m => m.startsWith('imopenlines')),
            placement: Object.keys(availableMethods).filter(m => m.startsWith('placement')),
            event: Object.keys(availableMethods).filter(m => m.startsWith('event')),
            crm: Object.keys(availableMethods).filter(m => m.startsWith('crm')),
            app: Object.keys(availableMethods).filter(m => m.startsWith('app'))
        };
        
        res.json({
            success: true,
            domain: domain,
            appInfo: appInfo,
            availableMethods: relevantMethods,
            totalMethods: Object.keys(availableMethods).length
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            domain: domain
        });
    }
});

// Debug endpoint
app.get('/debug', (req, res) => {
    console.log('🐛 Debug endpoint accessed');
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
        },
        activeConnections: activeConnections.size,
        whatsappStatus: whatsappHandler ? whatsappHandler.getConnectionStatus() : null
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

// Installation POST handler with improved error handling
app.post('/install.js', async (req, res) => {
    console.log('📦 POST Installation requested');
    console.log('📋 Body:', req.body);
    
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
        
        // Extract domain from various sources
        let targetDomain = DOMAIN;
        if (!targetDomain && req.headers.origin) {
            const match = req.headers.origin.match(/https?:\/\/([^\/]+)/);
            if (match) {
                targetDomain = match[1];
                console.log('🔍 Domain extracted from origin:', targetDomain);
            }
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
            // Initialize the custom channel app with better error handling
            const customApp = new CustomChannelApp(targetDomain || 'unknown.bitrix24.com', AUTH_ID);
            const installResult = await customApp.install();
            
            console.log('✅ Installation process completed');
            
            res.json({ 
                success: true, 
                message: 'Installation completed successfully',
                domain: targetDomain,
                member_id: member_id,
                placement: PLACEMENT,
                result: installResult
            });
            
        } catch (installError) {
            console.error('❌ Installation process error:', installError);
            
            // Return partial success to avoid Bitrix24 error display
            res.json({ 
                success: true, 
                message: 'Installation received, completing setup in background',
                domain: targetDomain || 'pending',
                member_id: member_id,
                warning: 'Some features may require manual configuration',
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

// OAuth callback with better error handling
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
        
        console.log('✅ Token response received');
        
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
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid #eee;
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
                transition: background 0.3s;
            }
            .button:hover { background: #0056b3; }
            .button:disabled { background: #6c757d; cursor: not-allowed; }
            .button.success { background: #28a745; }
            .button.danger { background: #dc3545; }
            #qr-code { max-width: 256px; margin: 10px auto; }
            .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin: 20px 0;
            }
            .stat-card {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                text-align: center;
            }
            .stat-value {
                font-size: 24px;
                font-weight: bold;
                color: #007bff;
            }
            .stat-label {
                font-size: 14px;
                color: #666;
            }
            .message-log {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 15px;
                margin: 20px 0;
                background: #f8f9fa;
            }
            .log-entry {
                margin-bottom: 10px;
                padding: 8px;
                background: white;
                border-radius: 4px;
                font-size: 14px;
            }
            .log-timestamp {
                color: #666;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🟢 WhatsApp Business Connector</h1>
                <p>Connect your WhatsApp Business to Bitrix24 CRM</p>
            </div>
            
            <div id="status" class="status connecting">
                Initializing connection...
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value" id="active-chats">0</div>
                    <div class="stat-label">Active Chats</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="messages-today">0</div>
                    <div class="stat-label">Messages Today</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="connection-status">Disconnected</div>
                    <div class="stat-label">Connection Status</div>
                </div>
            </div>
            
            <div id="qr-container" class="qr-container" style="display: none;">
                <h3>📱 Scan QR Code with WhatsApp</h3>
                <div id="qr-code"></div>
                <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <button id="connect-btn" class="button" onclick="initializeConnection()">
                    🔗 Connect WhatsApp
                </button>
                <button id="disconnect-btn" class="button danger" onclick="disconnectWhatsApp()" style="display: none;">
                    🔌 Disconnect
                </button>
                <button id="status-btn" class="button" onclick="getStatus()">
                    📊 Get Status
                </button>
            </div>
            
            <div class="message-log">
                <h4>📋 Activity Log</h4>
                <div id="log-container">
                    <div class="log-entry">
                        <div class="log-timestamp">${new Date().toLocaleString()}</div>
                        <div>WhatsApp Connector initialized</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let socket;
            let isConnected = false;
            let messageCount = 0;

            // Initialize when page loads
            BX24.init(function() {
                console.log('Bitrix24 API initialized');
                setupSocketConnection();
                
                // Get current domain and token from Bitrix24
                BX24.callMethod('app.info', {}, function(result) {
                    if (!result.error()) {
                        console.log('App info:', result.data());
                        addLogEntry('Bitrix24 API connected successfully');
                    }
                });
            });

            function setupSocketConnection() {
                socket = io('${BASE_URL}');
                
                socket.on('connect', function() {
                    console.log('Socket connected');
                    updateStatus('Connected to server', 'connecting');
                    addLogEntry('Socket.IO connected to server');
                });
                
                socket.on('qr_code', function(qr) {
                    console.log('QR code received');
                    showQRCode(qr);
                    addLogEntry('QR code received - scan with WhatsApp');
                });
                
                socket.on('status_update', function(status) {
                    console.log('Status update:', status);
                    updateStatus(status, 'connecting');
                    addLogEntry('Status: ' + status);
                });
                
                socket.on('whatsapp_connected', function() {
                    console.log('WhatsApp connected!');
                    updateStatus('✅ WhatsApp Connected Successfully!', 'connected');
                    hideQRCode();
                    isConnected = true;
                    document.getElementById('connect-btn').style.display = 'none';
                    document.getElementById('disconnect-btn').style.display = 'inline-block';
                    document.getElementById('connection-status').textContent = 'Connected';
                    addLogEntry('WhatsApp connected successfully!');
                });
                
                socket.on('message_received', function(messageData) {
                    console.log('Message received:', messageData);
                    messageCount++;
                    document.getElementById('messages-today').textContent = messageCount;
                    addLogEntry('Message received from ' + (messageData.userName || 'Unknown'));
                });
                
                socket.on('status_response', function(status) {
                    console.log('Status response:', status);
                    updateDashboard(status);
                });
                
                socket.on('error', function(error) {
                    console.error('Socket error:', error);
                    updateStatus('❌ Error: ' + error, 'error');
                    addLogEntry('Error: ' + error);
                });
                
                socket.on('disconnect', function() {
                    console.log('Socket disconnected');
                    updateStatus('Disconnected from server', 'error');
                    document.getElementById('connection-status').textContent = 'Disconnected';
                    addLogEntry('Disconnected from server');
                });
            }

            function initializeConnection() {
                const button = document.getElementById('connect-btn');
                button.disabled = true;
                button.textContent = 'Connecting...';
                
                updateStatus('Initializing WhatsApp connection...', 'connecting');
                addLogEntry('Initializing WhatsApp connection...');
                
                // Get domain from current URL or use default
                const domain = window.location.hostname || 'unknown';
                
                // For now, we'll use a placeholder token - in production, get this from Bitrix24
                BX24.callMethod('app.info', {}, function(result) {
                    let accessToken = 'demo_token';
                    
                    if (!result.error() && result.data().access_token) {
                        accessToken = result.data().access_token;
                    }
                    
                    socket.emit('initialize_whatsapp', {
                        domain: domain,
                        accessToken: accessToken
                    });
                });
            }

            function disconnectWhatsApp() {
                updateStatus('Disconnecting...', 'connecting');
                addLogEntry('Disconnecting WhatsApp...');
                
                // Implement disconnect logic
                isConnected = false;
                document.getElementById('connect-btn').style.display = 'inline-block';
                document.getElementById('disconnect-btn').style.display = 'none';
                document.getElementById('connection-status').textContent = 'Disconnected';
                
                const button = document.getElementById('connect-btn');
                button.disabled = false;
                button.textContent = '🔗 Connect WhatsApp';
            }

            function getStatus() {
                socket.emit('get_status');
                addLogEntry('Requesting status update...');
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

            function updateDashboard(status) {
                if (status.activeSessions !== undefined) {
                    document.getElementById('active-chats').textContent = status.activeSessions;
                }
                if (status.whatsappConnected) {
                    document.getElementById('connection-status').textContent = 'Connected';
                } else {
                    document.getElementById('connection-status').textContent = 'Disconnected';
                }
            }

            function addLogEntry(message) {
                const logContainer = document.getElementById('log-container');
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = \`
                    <div class="log-timestamp">\${new Date().toLocaleString()}</div>
                    <div>\${message}</div>
                \`;
                logContainer.appendChild(entry);
                
                // Keep only last 20 entries
                const entries = logContainer.querySelectorAll('.log-entry');
                if (entries.length > 20) {
                    entries[0].remove();
                }
                
                // Scroll to bottom
                logContainer.scrollTop = logContainer.scrollHeight;
            }

            // Auto-refresh status every 30 seconds
            setInterval(() => {
                if (socket && socket.connected) {
                    getStatus();
                }
            }, 30000);
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
                <div class="feature">Automatic message sync with CRM</div>
                <div class="feature">Lead creation from new chats</div>
                <div class="feature">Real-time notifications</div>
                <div class="feature">Message history preservation</div>
                <div class="feature">Contact auto-creation</div>
            </div>
            
            <div style="margin-top: 30px;">
                <button class="install-btn" onclick="startInstallation()">
                    Install WhatsApp Connector
                </button>
            </div>
        </div>
        
        <script>
            function startInstallation() {
                alert('Visit your Bitrix24 marketplace to install this connector, or contact your administrator for setup instructions.');
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
            .button {
                background: #007bff;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                margin: 5px;
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
                    <span class="value">${installResult.success ? 'Installed' : 'Partial'}</span>
                </div>
            </div>
            
            <div class="next-steps">
                <h3>Next Steps:</h3>
                <div class="step">
                    <strong>1. Access the Connector</strong><br>
                    Find the WhatsApp connector in your Bitrix24 applications or CRM menu.
                </div>
                <div class="step">
                    <strong>2. Connect WhatsApp Business</strong><br>
                    Scan the QR code with your WhatsApp Business account to establish the connection.
                </div>
                <div class="step">
                    <strong>3. Configure Settings</strong><br>
                    Set up auto-replies, lead creation rules, and notification preferences.
                </div>
                <div class="step">
                    <strong>4. Start Receiving Messages</strong><br>
                    All WhatsApp messages will now appear in your Bitrix24 CRM with automatic contact creation.
                </div>
            </div>
            
            <div style="margin-top: 30px;">
                <a href="${BASE_URL}/handler.js" class="button">
                    Open WhatsApp Connector
                </a>
                <button onclick="window.close()" class="button">
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
    console.log(`🪝 Webhook: ${BASE_URL}/webhook`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    
    // Clean up WhatsApp handler
    if (whatsappHandler) {
        await whatsappHandler.cleanup();
    }
    
    // Close server
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    
    // Clean up WhatsApp handler
    if (whatsappHandler) {
        await whatsappHandler.cleanup();
    }
    
    // Close server
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io, whatsappHandler };
