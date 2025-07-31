// Updated install.js with proper Web UI and fixed API calls

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

    let whatsappHandler = null;
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
            if (!whatsappHandler || !data.CHAT_ID || !data.MESSAGE) return;
            const whatsappChatId = data.CHAT_ID;
            const message = data.MESSAGE;
            await whatsappHandler.sendOutgoingMessage(whatsappChatId, message);
            console.log('✅ Message sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling Bitrix message:', error);
        }
    }
    async function handleNewLead(data, auth) { console.log('🎯 New lead created:', data); }
    async function handleNewContact(data, auth) { console.log('👤 New contact created:', data); }

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
                
                activeConnections.set(socket.id, {
                    domain: data.domain,
                    accessToken: data.accessToken,
                    connectedAt: new Date()
                });
                
                whatsappHandler = new WhatsAppBitrix24Handler({
                    bitrix24Domain: data.domain,
                    accessToken: data.accessToken,
                    connectorId: 'custom_whatsapp'
                });
                
                whatsappHandler.on('qr', (qr) => {
                    console.log('📱 Emitting QR code to client');
                    socket.emit('qr_code', qr);
                });
                
                whatsappHandler.on('status', (status) => {
                    console.log('📊 Status update:', status);
                    socket.emit('status_update', status);
                });
                
                whatsappHandler.on('connected', () => {
                    console.log('✅ WhatsApp connected, notifying client');
                    socket.emit('whatsapp_connected');
                });
                
                whatsappHandler.on('message_received', (messageData) => {
                    console.log('📨 Message received, forwarding to client');
                    socket.emit('message_received', messageData);
                });
                
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
                socket.emit('status_response', { connected: false, activeSessions: 0 });
            }
        });

        socket.on('disconnect_whatsapp', async () => {
            try {
                if (whatsappHandler) {
                    await whatsappHandler.disconnect();
                    whatsappHandler = null;
                }
                socket.emit('status_update', 'WhatsApp disconnected');
            } catch (error) {
                console.error('❌ Error disconnecting WhatsApp:', error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 User disconnected:', socket.id);
            activeConnections.delete(socket.id);
        });
    });

    // --- Express Routes ---
    app.get('/health', (req, res) =>
        res.json({ status: 'ok', timestamp: new Date().toISOString() })
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
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js"></script>
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
            margin-right: 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
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
                    <button class="btn btn-primary" onclick="initializeConnection()">
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
                        <canvas id="qrCode"></canvas>
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
        const socket = io();
        let isConnected = false;
        
        // Socket event handlers
        socket.on('connect', () => {
            console.log('Connected to server');
            updateStatus('configStatus', 'Connected to server', 'success');
        });
        
        socket.on('qr_code', (qr) => {
            console.log('QR Code received');
            displayQRCode(qr);
            activateStep(2);
            updateStatus('whatsappStatus', 'QR Code received. Please scan with your phone.', 'info');
        });
        
        socket.on('status_update', (status) => {
            console.log('Status update:', status);
            updateStatus('whatsappStatus', status, 'info');
            
            if (status.includes('Connected')) {
                updateConnectionStatus();
                activateStep(3);
            }
        });
        
        socket.on('whatsapp_connected', () => {
            console.log('WhatsApp connected successfully!');
            isConnected = true;
            updateStatus('whatsappStatus', '✅ WhatsApp connected successfully!', 'success');
            document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
            updateConnectionStatus();
        });
        
        socket.on('message_received', (messageData) => {
            console.log('Message received:', messageData);
            // Update message counter
            const current = parseInt(document.getElementById('messagesProcessed').textContent);
            document.getElementById('messagesProcessed').textContent = current + 1;
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            updateStatus('configStatus', \`Error: \${error}\`, 'error');
            hideLoading();
        });
        
        // Functions
        function initializeConnection() {
            const domain = document.getElementById('domain').value.trim();
            const accessToken = document.getElementById('accessToken').value.trim();
            
            if (!domain || !accessToken) {
                updateStatus('configStatus', 'Please fill in both domain and access token', 'error');
                return;
            }
            
            showLoading();
            updateStatus('configStatus', 'Initializing connection...', 'info');
            
            socket.emit('initialize_whatsapp', {
                domain: domain,
                accessToken: accessToken
            });
            
            document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
        }
        
        function displayQRCode(qrData) {
            const canvas = document.getElementById('qrCode');
            QRCode.toCanvas(canvas, qrData, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            document.getElementById('qrContainer').classList.remove('hidden');
        }
        
        function updateStatus(elementId, message, type) {
            const element = document.getElementById(elementId);
            element.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
        }
        
        function activateStep(stepNumber) {
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
        }
        
        function hideLoading() {
            document.getElementById('connectLoading').classList.add('hidden');
            document.getElementById('connectText').textContent = 'Connect';
        }
        
        function updateConnectionStatus() {
            socket.emit('get_status');
        }
        
        socket.on('status_response', (status) => {
            console.log('Status response:', status);
            
            if (status.whatsappConnected) {
                document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
            }
            
            if (status.activeSessions !== undefined) {
                document.getElementById('activeSessions').textContent = status.activeSessions;
            }
        });
        
        function disconnectWhatsApp() {
            if (confirm('Are you sure you want to disconnect WhatsApp?')) {
                socket.emit('disconnect_whatsapp');
                isConnected = false;
                document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                document.getElementById('activeSessions').textContent = '0';
                updateStatus('whatsappStatus', 'WhatsApp disconnected', 'info');
                activateStep(1);
            }
        }
        
        // Auto-fill domain if available from URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('domain')) {
            document.getElementById('domain').value = urlParams.get('domain');
        }
        if (urlParams.get('access_token')) {
            document.getElementById('accessToken').value = urlParams.get('access_token');
        }
        
        // Update status every 30 seconds
        setInterval(() => {
            if (isConnected) {
                updateConnectionStatus();
            }
        }, 30000);
    </script>
</body>
</html>`;
    }

    // --- Start Server ---
    server.listen(PORT, () => {
        console.log(`✅✅✅ Application started successfully! ✅✅✅`);
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 Socket.IO enabled`);
        console.log(`🌐 Access at: ${BASE_URL}`);
        console.log(`🔐 OAuth scopes: ${APP_SCOPE}`);
        console.log(`📱 WhatsApp Interface: ${BASE_URL}/app`);
    });

    // --- Graceful Shutdown ---
    const gracefulShutdown = async (signal) => {
        console.log(`🛑 ${signal} received, shutting down gracefully`);
        if (whatsappHandler) await whatsappHandler.cleanup();
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
