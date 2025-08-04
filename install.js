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
    // UPDATED: Added placement scope for embedding the app in Bitrix24 interface
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

    // NEW: Updated app route to handle Bitrix24 embedding
    app.get('/app', (req, res) => {
        const isEmbedded = req.headers['x-bitrix24-domain'] || req.query.DOMAIN;
        if (isEmbedded) {
            // This is being loaded inside Bitrix24
            res.send(getBitrix24EmbeddedHTML());
        } else {
            // This is standalone access
            res.send(getWhatsAppConnectorHTML());
        }
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
    console.log('📦 Install.js route accessed');
    console.log('📋 Query params:', req.query);
    console.log('📋 Headers:', req.headers);
    console.log('📋 Referer:', req.headers.referer);
    
    // Extract domain from referer header (this is how we can get the Bitrix24 domain)
    let domain = req.query.DOMAIN || req.query.domain;
    
    if (!domain && req.headers.referer) {
        // Extract domain from referer URL
        try {
            const refererUrl = new URL(req.headers.referer);
            domain = refererUrl.hostname;
            console.log('🔍 Extracted domain from referer:', domain);
        } catch (e) {
            console.log('❌ Could not parse referer URL');
        }
    }
    
    if (!domain) {
        // Show a form to manually enter domain
        return res.send(getBitrix24DomainFormHTML());
    }
    
    console.log('🔐 Creating OAuth URL for domain:', domain);
    console.log('🔐 Using APP_ID:', process.env.APP_ID);
    console.log('🔐 Using scopes:', APP_SCOPE);
    
    const authUrl = `https://${domain}/oauth/authorize/?` + querystring.stringify({
        client_id: process.env.APP_ID,
        response_type: 'code',
        scope: APP_SCOPE,
        redirect_uri: `${process.env.BASE_URL}/oauth/callback`
    });
    
    console.log('🌐 OAuth URL:', authUrl);
    
    // Return HTML that redirects to OAuth
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Installing WhatsApp Connector</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #25D366; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <h2>📱 Installing WhatsApp Connector</h2>
        <div class="spinner"></div>
        <p>Domain: <strong>${domain}</strong></p>
        <p>Redirecting to Bitrix24 authorization...</p>
        <script>
            console.log('Redirecting to:', '${authUrl}');
            window.location.href = '${authUrl}';
        </script>
    </body>
    </html>
    `);
});

    app.post('/install.js', async (req, res) => {
    console.log('📦 POST Install.js route accessed');
    console.log('📋 Body:', req.body);
    console.log('📋 Headers:', req.headers);
    
    // Extract data from Bitrix24's installation request
    const authId = req.body.AUTH_ID;
    const memberId = req.body.member_id;
    const placement = req.body.PLACEMENT;
    
    // Check if this is a Bitrix24 installation request
    if (authId && memberId) {
        console.log('✅ Bitrix24 installation request detected');
        console.log('🔑 AUTH_ID:', authId);
        console.log('👤 Member ID:', memberId);
        
        // Try to extract domain from referer or other headers
        let domain = null;
        
        // Method 1: Check referer header
        if (req.headers.referer) {
            try {
                const refererUrl = new URL(req.headers.referer);
                domain = refererUrl.hostname;
                console.log('🔍 Extracted domain from referer:', domain);
            } catch (e) {
                console.log('❌ Could not parse referer URL');
            }
        }
        
        // Method 2: Check host header patterns
        if (!domain && req.headers.host) {
            // Sometimes Bitrix24 might forward the original host
            console.log('🔍 Checking host header:', req.headers.host);
        }
        
        // Method 3: Extract from member_id (advanced method)
        if (!domain && memberId) {
            // The member_id might contain domain information
            // This is a fallback method that might work
            console.log('🔍 Trying to use member_id for domain detection');
        }
        
        if (domain && domain.includes('bitrix24')) {
            // We found a domain, redirect to OAuth
            console.log('🚀 Redirecting to OAuth for domain:', domain);
            
            const authUrl = `https://${domain}/oauth/authorize/?` + querystring.stringify({
                client_id: APP_ID,
                response_type: 'code',
                scope: APP_SCOPE,
                redirect_uri: `${BASE_URL}/oauth/callback`
            });
            
            return res.redirect(authUrl);
        } else {
            // We have Bitrix24 data but no domain - show domain form
            console.log('⚠️ Bitrix24 installation detected but no domain found');
            return res.send(getBitrix24InstallationFormHTML(authId, memberId));
        }
    }
    
    // Fallback: check for manually provided domain
    const domain = req.body.domain || req.body.DOMAIN;
    if (domain) {
        const authUrl = `https://${domain}/oauth/authorize/?` + querystring.stringify({
            client_id: APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${BASE_URL}/oauth/callback`
        });
        
        return res.redirect(authUrl);
    }
    
    // If we get here, we don't have enough information
    console.log('❌ Insufficient data for installation');
    return res.status(400).send(getInstallationErrorHTML());
});

// Add this new HTML template function:
function getBitrix24InstallationFormHTML(authId, memberId) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Connector - Complete Installation</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 20px;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 500px;
                width: 100%;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .header h2 {
                color: #25D366;
                margin-bottom: 10px;
                font-size: 1.8rem;
            }
            .form-group {
                margin-bottom: 20px;
            }
            .form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #333;
            }
            .form-group input {
                width: 100%;
                padding: 15px;
                border: 2px solid #ddd;
                border-radius: 10px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            .form-group input:focus {
                outline: none;
                border-color: #25D366;
            }
            .btn {
                width: 100%;
                padding: 15px;
                background: #25D366;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.3s;
            }
            .btn:hover {
                background: #128C7E;
            }
            .info {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 10px;
                margin-top: 20px;
            }
            .info h4 {
                color: #25D366;
                margin-top: 0;
            }
            .success-indicator {
                background: #d4edda;
                color: #155724;
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 20px;
                border-left: 4px solid #25D366;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>📱 WhatsApp Connector</h2>
                <p>Almost there! We need your Bitrix24 domain to complete the installation.</p>
            </div>
            
            <div class="success-indicator">
                ✅ Installation request received from Bitrix24<br>
                🔑 Authentication data verified
            </div>
            
            <form method="POST" action="/install.js">
                <input type="hidden" name="auth_id" value="${authId}">
                <input type="hidden" name="member_id" value="${memberId}">
                
                <div class="form-group">
                    <label for="domain">Your Bitrix24 Domain:</label>
                    <input type="text" 
                           id="domain" 
                           name="domain" 
                           placeholder="yourcompany.bitrix24.com" 
                           required
                           pattern="[a-zA-Z0-9.-]+\.bitrix24\.(com|net|ru|de|fr|es|it|pl|ua|kz|by)"
                    >
                </div>
                
                <button type="submit" class="btn">Complete Installation</button>
            </form>
            
            <div class="info">
                <h4>💡 How to find your domain:</h4>
                <ul>
                    <li>Look at your Bitrix24 URL in the browser address bar</li>
                    <li>If it shows <code>https://mycompany.bitrix24.com</code></li>
                    <li>Then enter: <code>mycompany.bitrix24.com</code></li>
                    <li>Don't include <code>https://</code> or any paths</li>
                </ul>
            </div>
        </div>
        
        <script>
            // Try to auto-detect domain from current page
            if (window.parent && window.parent.location) {
                try {
                    const parentUrl = window.parent.location.href;
                    const match = parentUrl.match(/https?:\/\/([^\/]+\.bitrix24\.[^\/]+)/);
                    if (match) {
                        document.getElementById('domain').value = match[1];
                        console.log('Auto-detected domain:', match[1]);
                    }
                } catch (e) {
                    console.log('Could not auto-detect domain from parent window');
                }
            }
            
            // Also try from referrer
            if (document.referrer) {
                try {
                    const referrerUrl = new URL(document.referrer);
                    if (referrerUrl.hostname.includes('bitrix24')) {
                        document.getElementById('domain').value = referrerUrl.hostname;
                        console.log('Auto-detected domain from referrer:', referrerUrl.hostname);
                    }
                } catch (e) {
                    console.log('Could not parse referrer');
                }
            }
        </script>
    </body>
    </html>
    `;
}

// 4. Update the /app route to handle the main application
app.get('/app', (req, res) => {
    console.log('🎯 App route accessed');
    console.log('📋 Query params:', req.query);
    console.log('📋 Headers:', req.headers);
    
    const domain = req.query.domain || req.query.DOMAIN;
    const accessToken = req.query.access_token || req.query.AUTH_ID;
    const isEmbedded = req.headers['x-bitrix24-domain'] || domain;
    
    if (isEmbedded) {
        // This is being loaded inside Bitrix24
        res.send(getBitrix24EmbeddedHTML());
    } else {
        // This is standalone access
        res.send(getWhatsAppConnectorHTML());
    }
});

// 5. Add a domain form for manual entry
function getBitrix24DomainFormHTML() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Connector - Enter Domain</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
            .form { background: #f8f9fa; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            input { width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 5px; font-size: 16px; }
            button { background: #25D366; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%; }
            button:hover { background: #128C7E; }
            .help { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="form">
            <h2>📱 WhatsApp Connector</h2>
            <p>Please enter your Bitrix24 domain to continue installation:</p>
            
            <form method="POST" action="/install.js">
                <input type="text" name="domain" placeholder="yourcompany.bitrix24.com" required>
                <button type="submit">Continue Installation</button>
            </form>
            
            <div class="help">
                <strong>💡 How to find your domain:</strong><br>
                Look at your Bitrix24 URL. If it's <code>https://mycompany.bitrix24.com</code>, 
                then enter <code>mycompany.bitrix24.com</code>
            </div>
        </div>
        
        <script>
            // Try to auto-detect domain from referrer
            if (document.referrer) {
                try {
                    const url = new URL(document.referrer);
                    if (url.hostname.includes('bitrix24')) {
                        document.querySelector('input[name="domain"]').value = url.hostname;
                    }
                } catch (e) {
                    console.log('Could not auto-detect domain');
                }
            }
        </script>
    </body>
    </html>
    `;
}

// 6. Add debug route to help troubleshoot
app.get('/debug-install', (req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        environment: {
            APP_ID: process.env.APP_ID,
            BASE_URL: process.env.BASE_URL,
            NODE_ENV: process.env.NODE_ENV
        },
        request: {
            method: req.method,
            url: req.url,
            query: req.query,
            headers: {
                'user-agent': req.headers['user-agent'],
                'referer': req.headers.referer,
                'x-bitrix24-domain': req.headers['x-bitrix24-domain'],
                'host': req.headers.host
            }
        }
    });
});


    app.get('/oauth/callback', async (req, res) => {
    console.log('🔐 OAuth callback received');
    console.log('📋 Query params:', req.query);
    
    try {
        const { code, domain, state } = req.query;
        
        if (!code) {
            throw new Error('Missing authorization code');
        }
        
        if (!domain) {
            throw new Error('Missing domain parameter');
        }
        
        console.log('🔄 Exchanging code for token...');
        console.log('🌐 Domain:', domain);
        console.log('🔑 Code:', code.substring(0, 20) + '...');

        const tokenData = {
            grant_type: 'authorization_code',
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code,
            scope: APP_SCOPE
        };

        const tokenResponse = await axios.post(
            `https://${domain}/oauth/token/`, 
            querystring.stringify(tokenData),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('📊 Token response status:', tokenResponse.status);
        const { access_token, refresh_token } = tokenResponse.data;

        if (!access_token) {
            throw new Error('Failed to obtain access token from Bitrix24');
        }

        console.log('✅ Access token received');
        console.log('🚀 Running installation logic...');

        // Install the app using CustomChannelApp
        const customApp = new CustomChannelApp(domain, access_token);
        const installResult = await customApp.install();

        console.log('📋 Installation result:', installResult.success ? '✅ Success' : '❌ Failed');

        // Redirect to the app interface
        const redirectUrl = `/app?domain=${domain}&access_token=${access_token}&installation=${installResult.success ? 'success' : 'partial'}`;
        console.log('🔄 Redirecting to:', redirectUrl);
        
        res.redirect(redirectUrl);

    } catch (error) {
        console.error('❌ OAuth callback error:', error.message);
        
        let errorHtml = `
        <html>
        <head><title>Installation Error</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <div style="background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px;">
                <h2>❌ Installation Failed</h2>
                <p><strong>Error:</strong> ${error.message}</p>
                <p><a href="/">← Try Again</a></p>
            </div>
        </body>
        </html>
        `;
        
        res.status(500).send(errorHtml);
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
                .highlight { background: #ffffcc; padding: 15px; border-left: 4px solid #25D366; margin: 15px 0; }
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
            
            <div class="highlight">
                <h3>🎯 NEW: After installation, look for WhatsApp in:</h3>
                <ul>
                    <li>✅ <strong>Left Menu</strong> - "WhatsApp" option</li>
                    <li>✅ <strong>CRM Contacts</strong> - WhatsApp tab/menu</li>
                    <li>✅ <strong>CRM Leads</strong> - WhatsApp tab/menu</li>
                    <li>✅ <strong>Applications List</strong> - WhatsApp Connector</li>
                </ul>
            </div>
            
            <div class="info">
                <h3>📋 Required Scopes:</h3>
                <p><code>${APP_SCOPE}</code></p>
            </div>
            
            <div class="info">
                <h3>✨ Features:</h3>
                <ul>
                    <li>✅ Embedded WhatsApp interface in Bitrix24</li>
                    <li>✅ QR Code scanning within Bitrix24</li>
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

    // NEW: Bitrix24 embedded version with Bitrix24 JS SDK
    function getBitrix24EmbeddedHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Connector - Bitrix24</title>
    <script src="//api.bitrix24.com/api/v1/"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
            padding: 10px;
        }
        
        .container {
            max-width: 100%;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 1.8rem;
            margin-bottom: 5px;
        }
        
        .content {
            padding: 20px;
        }
        
        .step {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 8px;
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
            margin-bottom: 10px;
        }
        
        .step-number {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #25D366;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 10px;
            font-size: 0.9rem;
        }
        
        .step-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: #333;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: #25D366;
            color: white;
        }
        
        .btn-primary:hover {
            background: #128C7E;
        }
        
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        
        .status {
            padding: 10px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 0.9rem;
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
        
        .status.info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }
        
        .qr-container {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 15px 0;
        }
        
        .qr-code {
            display: inline-block;
            padding: 15px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin-bottom: 15px;
        }
        
        .connection-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .info-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        
        .info-card h4 {
            color: #25D366;
            margin-bottom: 8px;
            font-size: 0.9rem;
        }
        
        .info-card p {
            color: #666;
            font-size: 1rem;
            font-weight: 600;
        }
        
        .hidden {
            display: none;
        }
        
        .debug-log {
            background: #1e1e1e;
            color: #00ff00;
            padding: 10px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 11px;
            max-height: 150px;
            overflow-y: auto;
            margin: 10px 0;
        }
        
        .auto-connect-info {
            background: #e3f2fd;
            border: 1px solid #2196F3;
            border-radius: 6px;
            padding: 15px;
            margin: 15px 0;
        }
        
        .auto-connect-info h4 {
            color: #1976D2;
            margin-bottom: 8px;
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
            <div class="debug-log" id="debugLog">
                <div>🔧 Bitrix24 Embedded Mode - Ready</div>
            </div>

            <div class="auto-connect-info">
                <h4>🎯 Bitrix24 Integration Active</h4>
                <p>This WhatsApp connector is running inside your Bitrix24. We'll automatically use your Bitrix24 credentials to connect.</p>
            </div>

            <div class="step active" id="step1">
                <div class="step-header">
                    <div class="step-number">1</div>
                    <div class="step-title">Connecting to Bitrix24...</div>
                </div>
                <div id="bitrixStatus">Initializing Bitrix24 connection...</div>
            </div>
            
            <div class="step" id="step2">
                <div class="step-header">
                    <div class="step-number">2</div>
                    <div class="step-title">Scan WhatsApp QR Code</div>
                </div>
                <div id="qrContainer" class="qr-container hidden">
                    <div class="qr-code">
                        <canvas id="qrCode" width="200" height="200"></canvas>
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">
                        <strong>📱 How to scan:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Go to Settings → Linked Devices<br>
                        3. Tap "Link a Device"<br>
                        4. Scan this QR code
                    </div>
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
                        <p id="bitrixConnectionStatus">❌ Connecting...</p>
                    </div>
                    <div class="info-card">
                        <h4>Active Sessions</h4>
                        <p id="activeSessions">0</p>
                    </div>
                    <div class="info-card">
                        <h4>Messages</h4>
                        <p id="messagesProcessed">0</p>
                    </div>
                </div>
                <div style="margin-top: 15px; text-align: center;">
                    <button class="btn btn-danger" onclick="disconnectWhatsApp()">Disconnect WhatsApp</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        function debugLog(message) {
            const debugElement = document.getElementById('debugLog');
            const timestamp = new Date().toLocaleTimeString();
            debugElement.innerHTML += '<div>[' + timestamp + '] ' + message + '</div>';
            debugElement.scrollTop = debugElement.scrollHeight;
            console.log('[DEBUG] ' + message);
        }

        let socket;
        let isConnected = false;
        let messageCount = 0;
        let bitrix24Domain = null;
        let bitrix24AccessToken = null;

        // Initialize Bitrix24 connection
        function initBitrix24() {
            debugLog('🔄 Initializing Bitrix24 connection...');
            
            // Check if we're in Bitrix24 environment
            if (typeof BX24 !== 'undefined') {
                debugLog('✅ Bitrix24 JS API detected');
                
                BX24.init(() => {
                    debugLog('🎯 Bitrix24 initialized successfully');
                    
                    // Get domain and access token from Bitrix24
                    const auth = BX24.getAuth();
                    if (auth && auth.domain && auth.access_token) {
                        bitrix24Domain = auth.domain;
                        bitrix24AccessToken = auth.access_token;
                        
                        debugLog('📡 Got Bitrix24 credentials: ' + bitrix24Domain);
                        updateStatus('bitrixStatus', '✅ Connected to Bitrix24: ' + bitrix24Domain, 'success');
                        document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
                        
                        // Auto-initialize WhatsApp connection
                        setTimeout(() => {
                            initSocket();
                            initializeWhatsAppConnection();
                        }, 1000);
                        
                    } else {
                        debugLog('❌ Could not get Bitrix24 auth data');
                        updateStatus('bitrixStatus', '❌ Failed to get Bitrix24 credentials', 'error');
                    }
                });
            } else {
                debugLog('⚠️ Not in Bitrix24 environment, checking URL params...');
                
                // Fallback: check URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('domain') && urlParams.get('access_token')) {
                    bitrix24Domain = urlParams.get('domain');  
                    bitrix24AccessToken = urlParams.get('access_token');
                    
                    debugLog('📡 Got credentials from URL: ' + bitrix24Domain);
                    updateStatus('bitrixStatus', '✅ Connected via URL params: ' + bitrix24Domain, 'success');
                    document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
                    
                    setTimeout(() => {
                        initSocket();
                        initializeWhatsAppConnection();
                    }, 1000);
                } else {
                    updateStatus('bitrixStatus', '❌ No Bitrix24 credentials available', 'error');
                    debugLog('❌ No credentials found in Bitrix24 API or URL');
                }
            }
        }

        function initSocket() {
            debugLog('🔌 Initializing Socket.IO connection...');
            socket = io();

            socket.on('connect', () => {
                debugLog('✅ Connected to server - Socket ID: ' + socket.id);
            });

            socket.on('disconnect', () => {
                debugLog('❌ Disconnected from server');
                document.getElementById('bitrixConnectionStatus').textContent = '❌ Disconnected';
                document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
                isConnected = false;
            });

            socket.on('qr_code', (qr) => {
                debugLog('📱 QR Code received - Length: ' + qr.length);
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
                updateStatus('whatsappStatus', 'Error: ' + error, 'error');
            });

            socket.on('status_response', (status) => {
                debugLog('📋 Status response received');
                document.getElementById('whatsappConnectionStatus').textContent = 
                    status.whatsappConnected ? '✅ Connected' : '❌ Disconnected';
                document.getElementById('activeSessions').textContent = status.activeSessions || 0;
                isConnected = status.whatsappConnected;
                updateConnectionStatus();
            });
        }

        function initializeWhatsAppConnection() {
            if (!bitrix24Domain || !bitrix24AccessToken) {
                debugLog('❌ Missing domain or access token');
                updateStatus('whatsappStatus', 'Missing Bitrix24 credentials', 'error');
                return;
            }

            debugLog('🔄 Initializing WhatsApp connection for domain: ' + bitrix24Domain);
            activateStep(2);

            socket.emit('initialize_whatsapp', {
                domain: bitrix24Domain,
                accessToken: bitrix24AccessToken
            });
        }

        function displayQRCode(qrData) {
            debugLog('📱 Attempting to render QR code...');
            const canvas = document.getElementById('qrCode');
            
            try {
                const qr = new QRious({
                    element: canvas,
                    value: qrData,
                    size: 200,
                    level: 'H'
                });

                document.getElementById('qrContainer').classList.remove('hidden');
                debugLog('✅ QR code rendered successfully');
            } catch (err) {
                debugLog('❌ Error rendering QR code: ' + err.message);
            }
        }

        function activateStep(stepNumber) {
            debugLog('🔄 Activating step ' + stepNumber);
            document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
            document.getElementById('step' + stepNumber).classList.add('active');
        }

        function updateStatus(elementId, message, type) {
            const statusElement = document.getElementById(elementId);
            statusElement.innerHTML = message;
            statusElement.className = 'status ' + type;
        }

        function updateConnectionStatus() {
            document.getElementById('activeSessions').textContent = isConnected ? 1 : 0;
            if (socket) socket.emit('get_status');
        }

        function disconnectWhatsApp() {
            if (!isConnected) {
                updateStatus('whatsappStatus', 'Not connected', 'info');
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

        // Start the app
        window.onload = () => {
            debugLog('🖥️ Bitrix24 embedded app loaded');
            initBitrix24();
        };

        // Periodic status updates
        setInterval(() => {
            if (isConnected && socket) {
                updateConnectionStatus();
            }
        }, 30000);
    </script>
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
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
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
            margin-right: 10px;
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
                    <div id="rawQrData" class="hidden"></div>
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
            debugElement.innerHTML += '<div>[' + timestamp + '] ' + message + '</div>';
            debugElement.scrollTop = debugElement.scrollHeight;
            console.log('[DEBUG] ' + message);
        }

        let socket;
        let isConnected = false;
        let messageCount = 0;

        function initSocket() {
            debugLog('🔌 Initializing Socket.IO connection...');
            socket = io();

            socket.onAny((event, ...args) => {
                debugLog('📡 Socket event: ' + event + ', Args: ' + JSON.stringify(args.slice(0, 2)));
            });

            socket.on('connect', () => {
                debugLog('✅ Connected to server - Socket ID: ' + socket.id);
                updateStatus('configStatus', 'Connected to server', 'success');
                document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
                socket.emit('get_status');
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
                updateStatus('configStatus', 'Error: ' + error, 'error');
                hideLoading();
            });

            socket.on('status_response', (status) => {
                debugLog('📋 Status response received');
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

        function displayQRCode(qrData) {
            debugLog('📱 Attempting to render QR code...');
            const canvas = document.getElementById('qrCode');
            if (!canvas) {
                debugLog('❌ Canvas element not found');
                return;
            }

            try {
                const qr = new QRious({
                    element: canvas,
                    value: qrData,
                    size: 256,
                    level: 'H'
                });

                const qrContainer = document.getElementById('qrContainer');
                qrContainer.classList.remove('hidden');
                qrContainer.style.display = 'block';
                debugLog('✅ QR code rendered successfully');
            } catch (err) {
                debugLog('❌ Error rendering QR code: ' + err.message);
                displayRawQrData(qrData);
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
            document.getElementById('step' + stepNumber).classList.add('active');
        }

        function updateStatus(elementId, message, type) {
            const statusElement = document.getElementById(elementId);
            statusElement.innerHTML = message;
            statusElement.className = 'status ' + type;
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
            debugLog('🔄 Initializing WhatsApp connection for domain: ' + domain);

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

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('domain')) {
            document.getElementById('domain').value = urlParams.get('domain');
            debugLog('📋 Auto-filled domain: ' + urlParams.get('domain'));
        }
        if (urlParams.get('access_token')) {
            document.getElementById('accessToken').value = urlParams.get('access_token');
            debugLog('📋 Auto-filled access token');
        }

        window.onload = () => {
            debugLog('🖥️ Page loaded, initializing socket...');
            initSocket();
            socket.emit('get_status');
        };

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
        console.log(`🎯 After installation, WhatsApp should appear in Bitrix24 interface!`);
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
