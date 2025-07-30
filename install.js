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
        baseUrl: BASE_URL
    });
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
    
    const { DOMAIN, PROTOCOL = 'https' } = req.query;
    
    if (!DOMAIN) {
        return res.status(400).send('Missing DOMAIN parameter');
    }
    
    const installUrl = `${PROTOCOL}://${DOMAIN}/marketplace/install/?client_id=${APP_ID}`;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Install WhatsApp Connector</title>
            <script src="//api.bitrix24.com/api/v1/"></script>
        </head>
        <body>
            <script>
                BX24.init(function(){
                    BX24.install(function(result){
                        if(result.status === 'installed') {
                            window.location.href = '${BASE_URL}/oauth/callback?code=' + result.code + '&domain=' + '${DOMAIN}';
                        }
                    });
                });
            </script>
        </body>
        </html>
    `);
});

// Installation POST handler
app.post('/install.js', async (req, res) => {
    console.log('📦 POST Installation requested');
    console.log('📋 Body:', req.body);
    
    try {
        const { DOMAIN, AUTH_ID, AUTH_EXPIRES, REFRESH_ID } = req.body;
        
        if (!DOMAIN || !AUTH_ID) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Here you would typically save the installation data
        console.log('✅ Installation data received for domain:', DOMAIN);
        
        res.json({ 
            success: true, 
            message: 'Installation completed successfully',
            domain: DOMAIN
        });
        
    } catch (error) {
        console.error('❌ Installation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
    console.log('🔐 OAuth callback received');
    console.log('📋 Query params:', req.query);
    
    try {
        const { code, domain, state } = req.query;
        
        if (!code || !domain) {
            throw new Error('Missing code or domain parameter');
        }
        
        // Exchange code for access token
        const tokenResponse = await axios.post(`https://${domain}/oauth/token/`, querystring.stringify({
            grant_type: 'authorization_code',
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code,
            redirect_uri: `${BASE_URL}/oauth/callback`
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const { access_token, refresh_token } = tokenResponse.data;
        
        if (!access_token) {
            throw new Error('Failed to obtain access token');
        }
        
        console.log('✅ Access token obtained for domain:', domain);
        
        // Initialize the custom channel app
        const customApp = new CustomChannelApp(domain, access_token);
        const installResult = await customApp.install();
        
        res.send(getInstallResultHTML(installResult, access_token, domain));
        
    } catch (error) {
        console.error('❌ OAuth callback error:', error);
        res.status(500).send(`
            <h2>Installation Error</h2>
            <p>Error: ${error.message}</p>
            <p>Please try the installation again.</p>
        `);
    }
});

// --- HTML Templates ---

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
