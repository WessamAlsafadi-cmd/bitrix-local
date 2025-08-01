// Fixed install.js with better Socket.IO and QR code handling

console.log('Starting install.js...');

try {
    // #1: Load Dependencies
    console.log('Loading dependencies...');
    const express = require('express');
    const http = require('http');
    const { Server } = require("socket.io");
    const axios = require('axios');
    const querystring = require('querystring');
    const path = require('path');
    require('dotenv').config();
    console.log('SUCCESS: Basic dependencies loaded.');

    // #2: Load Local Modules
    console.log("Loading local modules...");
    const WhatsAppBitrix24Handler = require('./handler.js');
    console.log("SUCCESS: Loaded handler.js.");

    console.log("Attempting to load './lib/customChannelApp.js'...");
    const CustomChannelApp = require('./lib/customChannelApp.js');
    console.log('SUCCESS: Loaded customChannelApp.js.');

    // #3: Initialize Application
    console.log('Initializing Express and Socket.IO...');
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    console.log('SUCCESS: Application initialized.');
    
    // #4: Load Configuration
    console.log('Loading configuration...');
    const PORT = process.env.PORT || 3000;
    const APP_ID = process.env.APP_ID || 'your_app_id_here';
    const APP_SECRET = process.env.APP_SECRET || 'your_app_secret_here';
    const APP_SCOPE = 'user,crm,imconnector,imopenlines,placement,event';
    const BASE_URL = process.env.BASE_URL || `https://your-app.onrender.com`;
    console.log('SUCCESS: Configuration loaded.');
    console.log('📋 Using OAuth scopes:', APP_SCOPE);

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    console.log('🚀 Bitrix24 WhatsApp Connector Server configuration complete.');

    // Store WhatsApp handler instances per socket
    const whatsappHandlers = new Map();
    const activeConnections = new Map();

    // --- Webhook endpoint for Bitrix24 events ---
    app.post('/webhook', async (req, res) => {
        try {
            console.log('🪝 Webhook received:', req.body);
            const { event, data, auth } = req.body;
            switch (event.toUpperCase()) {
                case 'ONIMMESSAGEADD':
                    await handleBitrixMessage(data, auth);
                    break;
                case 'ONCRMLEADADD':
                    await handleNewLead(data, auth);
                    break;
                case 'ONCRMCONTACTADD':
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

    async function handleBitrixMessage(data, auth) {
        try {
            console.log('📨 Handling Bitrix24 message:', data);
            // Find the appropriate WhatsApp handler
            const handler = Array.from(whatsappHandlers.values()).find(h => 
                h.config.bitrix24Domain === auth.domain
            );
            
            if (!handler || !data.CHAT_ID || !data.MESSAGE) return;
            
            const whatsappChatId = data.CHAT_ID;
            const message = data.MESSAGE;
            await handler.sendOutgoingMessage(whatsappChatId, message);
            console.log('✅ Message sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling Bitrix message:', error);
        }
    }
    
    async function handleNewLead(data, auth) { 
        console.log('🎯 New lead created:', data); 
    }
    
    async function handleNewContact(data, auth) { 
        console.log('👤 New contact created:', data); 
    }

    // --- Enhanced Socket.IO Logic ---
    io.on('connection', (socket) => {
        console.log('👤 User connected:', socket.id);

        socket.on('initialize_whatsapp', async (data) => {
            try {
                console.log('🔄 Initializing WhatsApp for user:', socket.id);
                console.log('📋 Received data:', { 
                    domain: data.domain, 
                    hasToken: !!data.accessToken 
                });
                
                if (!data.domain || !data.accessToken) {
                    console.error('❌ Missing domain or access token');
                    socket.emit('error', 'Missing domain or access token');
                    return;
                }
                
                // Store connection info
                activeConnections.set(socket.id, {
                    domain: data.domain,
                    accessToken: data.accessToken,
                    connectedAt: new Date()
                });
                
                // Create new WhatsApp handler instance
                const whatsappHandler = new WhatsAppBitrix24Handler({
                    bitrix24Domain: data.domain,
                    accessToken: data.accessToken,
                    connectorId: 'custom_whatsapp'
                });
                
                // Store handler instance
                whatsappHandlers.set(socket.id, whatsappHandler);
                
                // Set up event listeners with proper error handling
                whatsappHandler.on('qr', (qr) => {
                    console.log('📱 QR Code received for socket:', socket.id);
                    console.log('📱 QR Code length:', qr.length);
                    console.log('📱 QR Code preview:', qr.substring(0, 50) + '...');
                    
                    try {
                        socket.emit('qr_code', qr);
                        console.log('✅ QR Code emitted to client');
                    } catch (emitError) {
                        console.error('❌ Failed to emit QR code:', emitError);
                    }
                });
                
                whatsappHandler.on('status', (status) => {
                    console.log('📊 Status update for socket', socket.id + ':', status);
                    try {
                        socket.emit('status_update', status);
                    } catch (emitError) {
                        console.error('❌ Failed to emit status:', emitError);
                    }
                });
                
                whatsappHandler.on('connected', () => {
                    console.log('✅ WhatsApp connected for socket:', socket.id);
                    try {
                        socket.emit('whatsapp_connected');
                    } catch (emitError) {
                        console.error('❌ Failed to emit connected event:', emitError);
                    }
                });
                
                whatsappHandler.on('message_received', (messageData) => {
                    console.log('📨 Message received for socket', socket.id + ':', messageData.messageId);
                    try {
                        socket.emit('message_received', messageData);
                    } catch (emitError) {
                        console.error('❌ Failed to emit message:', emitError);
                    }
                });
                
                whatsappHandler.on('error', (error) => {
                    console.error('❌ WhatsApp handler error for socket', socket.id + ':', error);
                    try {
                        socket.emit('error', error.message || error);
                    } catch (emitError) {
                        console.error('❌ Failed to emit error:', emitError);
                    }
                });
                
                // Initialize WhatsApp connection
                console.log('🚀 Starting WhatsApp initialization...');
                await whatsappHandler.initWhatsApp();
                
            } catch (error) {
                console.error('❌ Error initializing WhatsApp for socket', socket.id + ':', error);
                socket.emit('error', error.message);
                
                // Clean up on error
                whatsappHandlers.delete(socket.id);
                activeConnections.delete(socket.id);
            }
        });

        socket.on('send_message', async (data) => {
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (!handler) {
                    socket.emit('error', 'WhatsApp not connected');
                    return;
                }
                
                const { chatId, message, files } = data;
                await handler.sendOutgoingMessage(chatId, message, files);
                socket.emit('message_sent', { success: true });
            } catch (error) {
                console.error('❌ Error sending message for socket', socket.id + ':', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('get_status', () => {
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    const status = handler.getConnectionStatus();
                    socket.emit('status_response', status);
                } else {
                    socket.emit('status_response', { 
                        connected: false, 
                        activeSessions: 0,
                        whatsappConnected: false
                    });
                }
            } catch (error) {
                console.error('❌ Error getting status for socket', socket.id + ':', error);
                socket.emit('error', 'Failed to get status');
            }
        });

        socket.on('disconnect_whatsapp', async () => {
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    console.log('🔌 Disconnecting WhatsApp for socket:', socket.id);
                    await handler.disconnect();
                    whatsappHandlers.delete(socket.id);
                }
                socket.emit('status_update', 'WhatsApp disconnected');
            } catch (error) {
                console.error('❌ Error disconnecting WhatsApp for socket', socket.id + ':', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', async () => {
            console.log('👋 User disconnected:', socket.id);
            
            try {
                // Clean up WhatsApp handler
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    console.log('🧹 Cleaning up WhatsApp handler for socket:', socket.id);
                    await handler.cleanup();
                    whatsappHandlers.delete(socket.id);
                }
                
                activeConnections.delete(socket.id);
            } catch (error) {
                console.error('❌ Error during disconnect cleanup for socket', socket.id + ':', error);
            }
        });
    });

    // --- Express Routes ---
    app.get('/health', (req, res) =>
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            activeConnections: activeConnections.size,
            activeHandlers: whatsappHandlers.size
        })
    );

    // Serve the main WhatsApp connector interface
    app.get('/app', (req, res) => {
        res.send(getWhatsAppConnectorHTML());
    });

    app.get('/handler.js', (req, res) => res.send(getAppWidgetHTML()));
    
    app.get('/', (req, res) => {
        // Check if this is an installation redirect
        if (req.query.domain && req.query.access_token) {
            // Redirect to the app interface with parameters
            res.redirect(`/app?domain=${req.query.domain}&access_token=${req.query.access_token}`);
        } else {
            res.send(getInstallationHTML(req));
        }
    });

    app.get('/install.js', (req, res) => {
        const { DOMAIN } = req.query;
        if (!DOMAIN) {
            return res.status(400).send('<h2>Installation Error</h2><p>Missing DOMAIN parameter.</p>');
        }
        
        console.log('🔐 Creating OAuth URL with scopes:', APP_SCOPE);
        
        const authUrl = `https://${DOMAIN}/oauth/authorize/?` + querystring.stringify({
            client_id: APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${BASE_URL}/oauth/callback`
        });
        
        console.log('🌐 OAuth URL:', authUrl);
        res.send(`<script>window.location.href = '${authUrl}';</script>`);
    });

    app.post('/install.js', async (req, res) => {
        console.log('📦 POST Installation requested');
        console.log('📋 Body:', req.body);
        try {
            const { DOMAIN, AUTH_ID } = req.body;
            let targetDomain = DOMAIN || (req.headers.origin && req.headers.origin.match(/https?:\/\/([^\/]+)/) ? req.headers.origin.match(/https?:\/\/([^\/]+)/)[1] : null);

            if (!AUTH_ID) {
                return res.status(400).json({ error: 'Missing AUTH_ID' });
            }

            const customApp = new CustomChannelApp(targetDomain, AUTH_ID);
            const installResult = await customApp.install();

            if (installResult.success) {
                res.json({ success: true, message: 'Installation successful', result: installResult });
            } else {
                res.json({ success: false, error: installResult.error, message: installResult.message, domain: targetDomain });
            }
        } catch (error) {
            console.error('❌ Installation handler error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/oauth/callback', async (req, res) => {
        console.log('🔐 OAuth callback received');
        try {
            const { code, domain } = req.query;
            if (!code || !domain) throw new Error('Missing code or domain');

            console.log('🔄 Exchanging code for token with scopes:', APP_SCOPE);

            const tokenData = {
                grant_type: 'authorization_code',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                code: code,
                scope: APP_SCOPE
            };

            const tokenResponse = await axios.post(`https://${domain}/oauth/token/`, querystring.stringify(tokenData));
            const { access_token, scope } = tokenResponse.data;

            if (!access_token) throw new Error('Failed to obtain access token');

            console.log('✅ Received access token with scope:', scope);

            const customApp = new CustomChannelApp(domain, access_token);
            const installResult = await customApp.install();

            // Redirect to the app interface with the access token
            res.redirect(`/app?domain=${domain}&access_token=${access_token}&installation=success`);

        } catch (error) {
            console.error('❌ OAuth callback error:', error);
            let errorMessage = error.message;
            if (error.response && error.response.data) {
                errorMessage += ` - ${JSON.stringify(error.response.data)}`;
            }
            res.status(500).send(`<h2>Installation Error</h2><p>${errorMessage}</p>`);
        }
    });

    // --- HTML Template Functions ---
    function getAppWidgetHTML() {
        return `
        <!DOCTYPE html>
        <html>
        <head><title>Handler JS</title></head>
        <body>
            <h2>This would typically serve a JS file or widget</h2>
        </body>
        </html>`;
    }

    function getInstallationHTML(req) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Install Bitrix24 WhatsApp Connector</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .info { background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>📱 Install Bitrix24 WhatsApp Connector</h2>
                <p>Connect WhatsApp Business to your Bitrix24 CRM</p>
            </div>
            
            <div class="info">
                <h3>🚀 How to Install:</h3>
                <ol>
                    <li>Go to your Bitrix24 portal</li>
                    <li>Navigate to Applications → Local Applications</li>
                    <li>Click "Add Application"</li>
                    <li>Enter this URL: <code>${BASE_URL}</code></li>
                    <li>Follow the installation wizard</li>
                </ol>
            </div>
            
            <div class="info">
                <h3>📋 Required Scopes:</h3>
                <p><code>${APP_SCOPE}</code></p>
            </div>
            
            <div class="info">
                <h3>✨ Features:</h3>
                <ul>
                    <li>✅ Receive WhatsApp messages in Bitrix24</li>
                    <li>✅ Auto-create contacts from WhatsApp users</li>
                    <li>✅ Log all conversations as CRM activities</li>
                    <li>✅ Send replies from Bitrix24 to WhatsApp</li>
                    <li>✅ Real-time message synchronization</li>
                </ul>
            </div>
        </body>
        </html>`;
    }

    function getWhatsAppConnectorHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Connector - Bitrix24</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px;
        }
        
        .step {
            margin-bottom: 30px;
            padding: 20px;
            border-radius: 12px;
            border: 2px solid #f0f0f0;
            transition: all 0.3s ease;
        }
        
        .step.active {
            border-color: #25D366;
            background: #f8fff8;
        }
        
        .step-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .step-number {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #25D366;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 15px;
        }
        
        .step-title {
            font-size: 1.3rem;
            font-weight: 600;
            color: #333;
        }
        
        .config-form {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: end;
        }
        
        .form-group {
            flex: 1;
            min-width: 200px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }
        
        .form-group input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: #25D366;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .btn-primary {
            background: #25D366;
            color: white;
        }
        
        .btn-primary:hover {
            background: #128C7E;
            transform: translateY(-2px);
        }
        
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        
        .btn-danger:hover {
            background: #c82333;
        }
        
        .status {
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-weight: 500;
        }
        
        .status.info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }
        
        .status.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .status.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .qr-container {
            text-align: center;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 12px;
            margin: 20px 0;
        }
        
        .qr-code {
            display: inline-block;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .qr-instructions {
            font-size: 1.1rem;
            color: #666;
            line-height: 1.6;
        }
        
        .connection-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .info-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        
        .info-card h4 {
            color: #25D366;
            margin-bottom: 10px;
        }
        
        .info-card p {
            color: #666;
            font-size: 1.2rem;
            font-weight: 600;
        }
        
        .hidden {
            display: none;
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #25D366;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .debug-log {
            background: #1e1e1e;
            color: #00ff00;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 WhatsApp Connector</h1>
            <p>Connect your WhatsApp to Bitrix24 CRM</p>
        </div>
        
        <div class="content">
            <!-- Debug Log -->
            <div class="debug-log" id="debugLog">
                <div>🔧 Debug Log - Ready</div>
            </div>

            <!-- Step 1: Configuration -->
            <div class="step active" id="step1">
                <div class="step-header">
                    <div class="step-number">1</div>
                    <div class="step-title">Configure Connection</div>
                </div>
                <div class="config-form">
                    <div class="form-group">
                        <label for="domain">Bitrix24 Domain</label>
                        <input type="text" id="domain" placeholder="yourcompany.bitrix24.com" />
                    </div>
                    <div class="form-group">
                        <label for="accessToken">Access Token</label>
                        <input type="text" id="accessToken" placeholder="Your access token" />
                    </div>
                    <button class="btn btn-primary" onclick="initializeConnection()" id="connectBtn">
                        <span id="connectText">Connect</span>
                        <div class="loading hidden" id="connectLoading"></div>
                    </button>
                </div>
                <div id="configStatus"></div>
            </div>
            
            <!-- Step 2: WhatsApp QR Code -->
            <div class="step" id="step2">
                <div class="step-header">
                    <div class="step-number">2</div>
                    <div class="step-title">Scan WhatsApp QR Code</div>
                </div>
                <div id="qrContainer" class="qr-container hidden">
                    <div class="qr-code">
                        <div id="qrCode" style="width: 256px; height: 256px; margin: 0 auto;"></div>
                    </div>
                    <div class="qr-instructions">
                        <strong>📱 How to scan:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Go to Settings → Linked Devices<br>
                        3. Tap "Link a Device"<br>
                        4. Scan this QR code
                    </div>
                </div>
                <div id="whatsappStatus"></div>
            </div>
            
            <!-- Step 3: Connection Status -->
            <div class="step" id="step3">
                <div class="step-header">
                    <div class="step-number">3</div>
                    <div class="step-title">Connection Status</div>
                </div>
                <div class="connection-info">
                    <div class="info-card">
                        <h4>WhatsApp</h4>
                        <p id="whatsappConnectionStatus">❌ Disconnected</p>
                    </div>
                    <div class="info-card">
                        <h4>Bitrix24</h4>
                        <p id="bitrixConnectionStatus">❌ Disconnected</p>
                    </div>
                    <div class="info-card">
                        <h4>Active Sessions</h4>
                        <p id="activeSessions">0</p>
                    </div>
                    <div class="info-card">
                        <h4>Messages Processed</h4>
                        <p id="messagesProcessed">0</p>
                    </div>
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-danger" onclick="disconnectWhatsApp()">Disconnect WhatsApp</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Debug logging function
        function debugLog(message) {
            const debugElement = document.getElementById('debugLog');
            const timestamp = new Date().toLocaleTimeString();
            debugElement.innerHTML += \`<div>[\${timestamp}] \${message}</div>\`;
            debugElement.scrollTop = debugElement.scrollHeight;
            console.log(\`[DEBUG] \${message}\`);
        }

        // Initialize Socket.IO
        let socket;
        let isConnected = false;
        
        // Initialize socket connection
        function initSocket() {
            debugLog('🔌 Initializing Socket.IO connection...');
            socket = io();
            
            socket.on('connect', () => {
                debugLog('✅ Connected to server - Socket ID: ' + socket.id);
                updateStatus('configStatus', 'Connected to server', 'success');
            });
            
            socket.on('disconnect', () => {
                debugLog('❌ Disconnected from server');
                updateStatus('configStatus', 'Disconnected from server', 'error');
            });
            
            socket.on('qr_code', (qr) => {
                debugLog('📱 QR Code received - Length: ' + qr.length);
                console.log('QR Data:', qr.substring(0, 100) + '...');
                displayQRCode(qr);
                activateStep(2);
                updateStatus('whatsappStatus', 'QR Code received. Please scan with your phone.', 'info');
            });
            
            socket.on('status_update', (status) => {
                debugLog('📊 Status update: ' + status);
                updateStatus('whatsappStatus', status, 'info');
                
                if (status.includes('Connected')) {
                    isConnected = true;
                    updateConnectionStatus();
                    activateStep(3);
                }
            });
            
            socket.on('whatsapp_connected', () => {
                debugLog('🎉 WhatsApp connected successfully!');
                isConnected = true;
                updateStatus('whatsappStatus', '✅ WhatsApp connected successfully!', 'success');
                document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
                updateConnectionStatus();
                activateStep(3);
            });
            
            socket.on('message_received', (messageData) => {
                debugLog('📨 Message received from: ' + messageData.userName);
                const current = parseInt(document.getElementById('messagesProcessed').textContent);
                document.getElementById('messagesProcessed').textContent = current + 1;
            });
            
            socket.on('error', (error) => {
                debugLog('❌ Socket error: ' + error);
                updateStatus('configStatus', \`Error: \${error}\`, 'error');
                hideLoading();
            });

            socket.on('status_response', (status) => {
                debugLog('📋 Status response received');
                console.log('Status response:', status);
                
                if (status.whatsappConnected) {
                    document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
                } else {
                    document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                }
                
                if (status.activeSessions !== undefined) {
                    document.getElementById('activeSessions').textContent = status.activeSessions;
                }
            });
        }
        
        // Initialize connection
        function initializeConnection() {
            const domain = document.getElementById('domain').value.trim();
            const accessToken = document.getElementById('accessToken').value.trim();
            
            if (!domain || !accessToken) {
                updateStatus('configStatus', 'Please fill in both domain and access token', 'error');
                return;
            }
            
            debugLog('🔄 Initializing WhatsApp connection...');
            debugLog('Domain: ' + domain);
            debugLog('Token: ' + accessToken.substring(0, 10) + '...');
            
            showLoading();
            updateStatus('configStatus', 'Initializing connection...', 'info');
            
            socket.emit('initialize_whatsapp', {
                domain: domain,
                accessToken: accessToken
            });
            
            document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
        }
        
        // QR Code display function - Fixed version
        function displayQRCode(qrData) {
            debugLog('🖼️ Rendering QR Code...');
            
            try {
                // Clear previous QR code
                const qrElement = document.getElementById('qrCode');
                qrElement.innerHTML = '';
                
                // Create QR code using qrcode-generator library
                const qr = qrcode(0, 'M');
                qr.addData(qrData);
                qr.make();
                
                // Create the QR code as HTML table (more reliable than canvas)
                const cellSize = 4;
                const margin = 4;
                const size = qr.getModuleCount();
                const totalSize = (size + 2 * margin) * cellSize;
                
                let html = \`<div style="width: \${totalSize}px; height: \${totalSize}px; background: white; margin: 0 auto;">\`;
                
                for (let row = -margin; row < size + margin; row++) {
                    for (let col = -margin; col < size + margin; col++) {
                        const isDark = (row >= 0 && row < size && col >= 0 && col < size) ? qr.isDark(row, col) : false;
                        const color = isDark ? '#000000' : '#FFFFFF';
                        html += \`<div style="width: \${cellSize}px; height: \${cellSize}px; background: \${color}; display: inline-block; vertical-align: top;"></div>\`;
                    }
                    html += '<br>';
                }
                html += '</div>';
                
                qrElement.innerHTML = html;
                
                // Show the QR container
                document.getElementById('qrContainer').classList.remove('hidden');
                
                debugLog('✅ QR Code rendered successfully');
                
            } catch (error) {
                debugLog('❌ QR Code rendering failed: ' + error.message);
                console.error('QR Code Error:', error);
                
                // Fallback: show QR data as text
                const qrElement = document.getElementById('qrCode');
                qrElement.innerHTML = \`
                    <div style="padding: 20px; background: #f0f0f0; border-radius: 8px;">
                        <p><strong>QR Code Data (for manual entry):</strong></p>
                        <textarea readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 10px;">\${qrData}</textarea>
                        <p><small>Copy this text and use a QR code generator if the QR code doesn't appear</small></p>
                    </div>
                \`;
                document.getElementById('qrContainer').classList.remove('hidden');
            }
        }
        
        function updateStatus(elementId, message, type) {
            const element = document.getElementById(elementId);
            element.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
        }
        
        function activateStep(stepNumber) {
            debugLog('📍 Activating step: ' + stepNumber);
            
            // Remove active class from all steps
            document.querySelectorAll('.step').forEach(step => {
                step.classList.remove('active');
            });
            
            // Add active class to current step
            document.getElementById(\`step\${stepNumber}\`).classList.add('active');
        }
        
        function showLoading() {
            document.getElementById('connectLoading').classList.remove('hidden');
            document.getElementById('connectText').textContent = 'Connecting...';
            document.getElementById('connectBtn').disabled = true;
        }
        
        function hideLoading() {
            document.getElementById('connectLoading').classList.add('hidden');
            document.getElementById('connectText').textContent = 'Connect';
            document.getElementById('connectBtn').disabled = false;
        }
        
        function updateConnectionStatus() {
            if (socket) {
                socket.emit('get_status');
            }
        }
        
        function disconnectWhatsApp() {
            if (confirm('Are you sure you want to disconnect WhatsApp?')) {
                debugLog('🔌 Disconnecting WhatsApp...');
                socket.emit('disconnect_whatsapp');
                isConnected = false;
                document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                document.getElementById('activeSessions').textContent = '0';
                updateStatus('whatsappStatus', 'WhatsApp disconnected', 'info');
                activateStep(1);
            }
        }
        
        // Auto-fill domain if available from URL params
        function loadUrlParams() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('domain')) {
                document.getElementById('domain').value = urlParams.get('domain');
                debugLog('🔗 Domain loaded from URL: ' + urlParams.get('domain'));
            }
            if (urlParams.get('access_token')) {
                document.getElementById('accessToken').value = urlParams.get('access_token');
                debugLog('🔗 Access token loaded from URL');
            }
        }
        
        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {
            debugLog('🚀 Page loaded, initializing...');
            loadUrlParams();
            initSocket();
            
            // Update status every 30 seconds
            setInterval(() => {
                if (isConnected && socket) {
                    updateConnectionStatus();
                }
            }, 30000);
        });
    </script>
</body>
</html>\`;
    }

    // --- Start Server ---
    server.listen(PORT, () => {
        console.log(\`✅✅✅ Application started successfully! ✅✅✅\`);
        console.log(\`🚀 Server running on port \${PORT}\`);
        console.log(\`📡 Socket.IO enabled\`);
        console.log(\`🌐 Access at: \${BASE_URL}\`);
        console.log(\`🔐 OAuth scopes: \${APP_SCOPE}\`);
        console.log(\`📱 WhatsApp Interface: \${BASE_URL}/app\`);
        console.log(\`👤 Active connections: \${activeConnections.size}\`);
        console.log(\`🤖 Active handlers: \${whatsappHandlers.size}\`);
    });

    // --- Graceful Shutdown ---
    const gracefulShutdown = async (signal) => {
        console.log(\`🛑 \${signal} received, shutting down gracefully\`);
        
        // Clean up all WhatsApp handlers
        console.log(\`🧹 Cleaning up \${whatsappHandlers.size} WhatsApp handlers...\`);
        for (const [socketId, handler] of whatsappHandlers.entries()) {
            try {
                await handler.cleanup();
                console.log(\`✅ Handler for socket \${socketId} cleaned up\`);
            } catch (error) {
                console.error(\`❌ Error cleaning up handler for socket \${socketId}:\`, error);
            }
        }
        
        whatsappHandlers.clear();
        activeConnections.clear();
        
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

} catch (error) {
    console.error('🔥🔥🔥 FATAL STARTUP ERROR 🔥🔥🔥');
    console.error('The application failed to start. See the error details below:');
    console.error(error);
    process.exit(1);
}
