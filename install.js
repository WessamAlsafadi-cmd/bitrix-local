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
            const handler = Array.from(whatsappHandlers.values()).find(h => 
                h.config.bitrix24Domain === auth.domain
            );
            
            if (!handler || !data.CHAT_ID || !data.MESSAGE) {
                console.log('⚠️ No handler or missing message data');
                return;
            }
            
            const whatsappChatId = data.CHAT_ID;
            const message = data.MESSAGE;
            await handler.sendOutgoingMessage(whatsappChatId, message);
            console.log('✅ Message sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling Bitrix message:', error);
        }
    }
    
    async function handleNewLead(data, auth) {
        try {
            console.log('🎯 New lead created:', data);
            const handler = Array.from(whatsappHandlers.values()).find(h => 
                h.config.bitrix24Domain === auth.domain
            );
            
            if (!handler || !data.ID || !data.TITLE) {
                console.log('⚠️ No handler or missing lead data');
                return;
            }
            
            // Send notification to WhatsApp admin
            const adminChatId = process.env.ADMIN_CHAT_ID || 'default_admin_chat_id';
            const message = `New lead created: ${data.TITLE} (ID: ${data.ID})`;
            await handler.sendOutgoingMessage(adminChatId, message);
            console.log('✅ Lead notification sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling new lead:', error);
        }
    }
    
    async function handleNewContact(data, auth) {
        try {
            console.log('👤 New contact created:', data);
            const handler = Array.from(whatsappHandlers.values()).find(h => 
                h.config.bitrix24Domain === auth.domain
            );
            
            if (!handler || !data.ID || !data.NAME) {
                console.log('⚠️ No handler or missing contact data');
                return;
            }
            
            // Send notification to WhatsApp admin
            const adminChatId = process.env.ADMIN_CHAT_ID || 'default_admin_chat_id';
            const message = `New contact created: ${data.NAME} (ID: ${data.ID})`;
            await handler.sendOutgoingMessage(adminChatId, message);
            console.log('✅ Contact notification sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling new contact:', error);
        }
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

    // HTML Template Functions
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
        /* [Existing styles remain unchanged] */
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 WhatsApp Connector</h1>
            <p>Connect your WhatsApp to Bitrix24 CRM</p>
        </div>
        
        <div class="content">
            <div class="debug-log" id="debugLog">
                <div>🔧 Debug Log - Ready</div>
            </div>

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
            
            <div class="step" id="step2">
                <div class="step-header">
                    <div class="step-number">2</div>
                    <div class="step-title">Scan WhatsApp QR Code</div>
                </div>
                <div id="qrContainer" class="qr-container hidden">
                    <div class="qr-code">
                        <canvas id="qrCode" width="256" height="256"></canvas>
                    </div>
                    <div class="qr-instructions">
                        <strong>📱 How to scan:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Go to Settings → Linked Devices<br>
                        3. Tap "Link a Device"<br>
                        4. Scan this QR code
                    </div>
                    <div id="rawQrData" class="hidden"></div> <!-- Fallback for raw QR data -->
                </div>
                <div id="whatsappStatus"></div>
            </div>
            
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
        function debugLog(message) {
            const debugElement = document.getElementById('debugLog');
            const timestamp = new Date().toLocaleTimeString();
            debugElement.innerHTML += \`<div>[${timestamp}] ${message}</div>\`;
            debugElement.scrollTop = debugElement.scrollHeight;
            console.log(`[DEBUG] ${message}`);
        }

        let socket;
        let isConnected = false;
        let messageCount = 0;

        function initSocket() {
            debugLog('🔌 Initializing Socket.IO connection...');
            socket = io();

            // Log all socket events for debugging
            socket.onAny((event, ...args) => {
                debugLog(`📡 Socket event: ${event}, Args: ${JSON.stringify(args.slice(0, 2))}`);
            });

            socket.on('connect', () => {
                debugLog('✅ Connected to server - Socket ID: ' + socket.id);
                updateStatus('configStatus', 'Connected to server', 'success');
                document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
                socket.emit('get_status'); // Request initial status
            });
            
            socket.on('disconnect', () => {
                debugLog('❌ Disconnected from server');
                updateStatus('configStatus', 'Disconnected from server', 'error');
                document.getElementById('bitrixConnectionStatus').textContent = '❌ Disconnected';
                document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                isConnected = false;
            });
            
            socket.on('qr_code', (qr) => {
                debugLog('📱 QR Code received - Length: ' + qr.length);
                console.log('QR Data:', qr.substring(0, 100) + '...');
                try {
                    if (typeof QRCode === 'undefined') {
                        debugLog('❌ QRCode library not loaded');
                        displayRawQrData(qr);
                        updateStatus('whatsappStatus', 'QRCode library failed to load. See raw data below.', 'error');
                        return;
                    }
                    const canvas = document.getElementById('qrCode');
                    if (!canvas) throw new Error('Canvas element not found');
                    displayQRCode(qr);
                    activateStep(2);
                    updateStatus('whatsappStatus', 'QR Code received. Please scan with your phone.', 'info');
                } catch (error) {
                    debugLog('❌ Error displaying QR code: ' + error.message);
                    displayRawQrData(qr);
                    updateStatus('whatsappStatus', 'Error displaying QR code: ' + error.message + '. See raw data below.', 'error');
                }
            });
            
            socket.on('status_update', (status) => {
                debugLog('📊 Status update: ' + status);
                updateStatus('whatsappStatus', status, 'info');
                if (status.includes('Connected')) {
                    isConnected = true;
                    updateConnectionStatus();
                    activateStep(3);
                } else if (status.includes('QR Code generated')) {
                    activateStep(2);
                }
            });
            
            socket.on('whatsapp_connected', () => {
                debugLog('🎉 WhatsApp connected successfully!');
                isConnected = true;
                updateStatus('whatsappStatus', '✅ WhatsApp connected successfully!', 'success');
                document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
                document.getElementById('qrContainer').classList.add('hidden');
                updateConnectionStatus();
                activateStep(3);
            });
            
            socket.on('message_received', (messageData) => {
                debugLog('📨 Message received from: ' + (messageData.userName || 'Unknown'));
                messageCount++;
                document.getElementById('messagesProcessed').textContent = messageCount;
            });
            
            socket.on('error', (error) => {
                debugLog('❌ Socket error: ' + error);
                updateStatus('configStatus', `Error: ${error}`, 'error');
                hideLoading();
            });

            socket.on('status_response', (status) => {
                debugLog('📋 Status response received');
                console.log('Status response:', status);
                document.getElementById('whatsappConnectionStatus').textContent = 
                    status.whatsappConnected ? '✅ Connected' : '❌ Disconnected';
                document.getElementById('activeSessions').textContent = status.activeSessions || 0;
                isConnected = status.whatsappConnected;
                updateConnectionStatus();
                if (status.whatsappConnected) {
                    activateStep(3);
                } else {
                    activateStep(1);
                }
            });
        }

        function updateStatus(elementId, message, type) {
            const statusElement = document.getElementById(elementId);
            statusElement.innerHTML = message;
            statusElement.className = `status ${type}`;
        }

        function displayQRCode(qrData) {
            debugLog('📱 Attempting to render QR code...');
            const canvas = document.getElementById('qrCode');
            if (!canvas) {
                debugLog('❌ Canvas element not found');
                throw new Error('Canvas element not found');
            }

            // Clear previous content
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);

            try {
                QRCode.toCanvas(canvas, qrData, {
                    width: 256,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                }, (error) => {
                    if (error) {
                        debugLog('❌ QRCode.toCanvas error: ' + error.message);
                        throw error;
                    }
                    debugLog('✅ QR code rendered successfully');
                });

                // Ensure QR container is visible
                const qrContainer = document.getElementById('qrContainer');
                qrContainer.classList.remove('hidden');
                qrContainer.style.display = 'block';
                debugLog('✅ QR container made visible');
            } catch (error) {
                debugLog('❌ Error rendering QR code: ' + error.message);
                throw error;
            }
        }

        function displayRawQrData(qrData) {
            debugLog('📜 Displaying raw QR data as fallback...');
            const rawQrElement = document.getElementById('rawQrData');
            rawQrElement.textContent = 'Raw QR Data: ' + qrData.substring(0, 100) + (qrData.length > 100 ? '...' : '');
            rawQrElement.classList.remove('hidden');
            const qrContainer = document.getElementById('qrContainer');
            qrContainer.classList.remove('hidden');
            qrContainer.style.display = 'block';
        }

        function activateStep(stepNumber) {
            debugLog('🔄 Activating step ' + stepNumber);
            document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
            document.getElementById(`step${stepNumber}`).classList.add('active');
        }

        function updateConnectionStatus() {
            document.getElementById('activeSessions').textContent = isConnected ? 1 : 0;
            socket.emit('get_status');
        }

        function showLoading() {
            const connectBtn = document.getElementById('connectBtn');
            const connectText = document.getElementById('connectText');
            const connectLoading = document.getElementById('connectLoading');
            connectBtn.disabled = true;
            connectText.classList.add('hidden');
            connectLoading.classList.remove('hidden');
        }

        function hideLoading() {
            const connectBtn = document.getElementById('connectBtn');
            const connectText = document.getElementById('connectText');
            const connectLoading = document.getElementById('connectLoading');
            connectBtn.disabled = false;
            connectText.classList.remove('hidden');
            connectLoading.classList.add('hidden');
        }

        function initializeConnection() {
            const domain = document.getElementById('domain').value.trim();
            const accessToken = document.getElementById('accessToken').value.trim();
            
            if (!domain || !accessToken) {
                updateStatus('configStatus', 'Please fill in both domain and access token', 'error');
                debugLog('❌ Missing domain or access token');
                return;
            }

            showLoading();
            debugLog(`🔄 Initializing WhatsApp connection for domain: ${domain}`);

            socket.emit('initialize_whatsapp', {
                domain: domain,
                accessToken: accessToken
            });
        }

        function disconnectWhatsApp() {
            if (!isConnected) {
                updateStatus('whatsappStatus', 'Not connected', 'info');
                debugLog('❌ Disconnect attempted but not connected');
                return;
            }

            if (confirm('Are you sure you want to disconnect WhatsApp?')) {
                debugLog('🔌 Disconnecting WhatsApp...');
                socket.emit('disconnect_whatsapp');
                isConnected = false;
                document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                document.getElementById('qrContainer').classList.add('hidden');
                updateConnectionStatus();
                activateStep(1);
                updateStatus('whatsappStatus', 'WhatsApp disconnected', 'info');
            }
        }

        // Auto-fill domain if available from URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('domain')) {
            document.getElementById('domain').value = urlParams.get('domain');
            debugLog('📋 Auto-filled domain: ' + urlParams.get('domain'));
        }
        if (urlParams.get('access_token')) {
            document.getElementById('accessToken').value = urlParams.get('access_token');
            debugLog('📋 Auto-filled access token');
        }

        // Initialize socket connection on page load
        window.onload = () => {
            debugLog('🖥️ Page loaded, initializing socket...');
            initSocket();
            socket.emit('get_status');
        };

        // Update status every 30 seconds
        setInterval(() => {
            if (isConnected) {
                debugLog('🔄 Periodic status update');
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
        try {
            // Disconnect all WhatsApp handlers
            for (const [socketId, handler] of whatsappHandlers) {
                console.log(`🧹 Cleaning up handler for socket: ${socketId}`);
                await handler.cleanup();
            }
            whatsappHandlers.clear();
            activeConnections.clear();

            // Close server
            server.close(() => {
                console.log('✅ Server closed successfully');
                process.exit(0);
            });

            // Force exit after timeout
            setTimeout(() => {
                console.error('❌ Force shutting down due to timeout');
                process.exit(1);
            }, 10000);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // --- Unhandled Error Handling ---
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

} catch (error) {
    console.error('🔥🔥🔥 FATAL STARTUP ERROR 🔥🔥🔥');
    console.error('The application failed to start. See the error details below:');
    console.error(error);
    process.exit(1);
}
