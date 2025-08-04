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
    const BASE_URL = process.env.BASE_URL || 'https://your-app.onrender.com';
    console.log('SUCCESS: Configuration loaded.');
    console.log('📋 Using OAuth scopes: ' + APP_SCOPE);

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    console.log('🚀 Bitrix24 WhatsApp Connector Server configuration complete.');

    // Store WhatsApp handler instances per socket
    const whatsappHandlers = new Map();
    const activeConnections = new Map();

    // --- Webhook endpoint for Bitrix24 events ---
    app.post('/webhook', async (req, res) => {
        try {
            console.log('🪝 Webhook received: ' + JSON.stringify(req.body));
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
                    console.log('🔄 Unhandled event type: ' + event);
            }
            res.json({ success: true });
        } catch (error) {
            console.error('❌ Webhook error: ' + error);
            res.status(500).json({ error: error.message });
        }
    });

    async function handleBitrixMessage(data, auth) {
        try {
            console.log('📨 Handling Bitrix24 message: ' + JSON.stringify(data));
            const handler = Array.from(whatsappHandlers.values()).find(function(h) {
                return h.config.bitrix24Domain === auth.domain;
            });
            
            if (!handler || !data.CHAT_ID || !data.MESSAGE) {
                console.log('⚠️ No handler or missing message data');
                return;
            }
            
            const whatsappChatId = data.CHAT_ID;
            const message = data.MESSAGE;
            await handler.sendOutgoingMessage(whatsappChatId, message);
            console.log('✅ Message sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling Bitrix message: ' + error);
        }
    }
    
    async function handleNewLead(data, auth) {
        try {
            console.log('🎯 New lead created: ' + JSON.stringify(data));
            const handler = Array.from(whatsappHandlers.values()).find(function(h) {
                return h.config.bitrix24Domain === auth.domain;
            });
            
            if (!handler || !data.ID || !data.TITLE) {
                console.log('⚠️ No handler or missing lead data');
                return;
            }
            
            const adminChatId = process.env.ADMIN_CHAT_ID || 'default_admin_chat_id';
            const message = 'New lead created: ' + data.TITLE + ' (ID: ' + data.ID + ')';
            await handler.sendOutgoingMessage(adminChatId, message);
            console.log('✅ Lead notification sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling new lead: ' + error);
        }
    }
    
    async function handleNewContact(data, auth) {
        try {
            console.log('👤 New contact created: ' + JSON.stringify(data));
            const handler = Array.from(whatsappHandlers.values()).find(function(h) {
                return h.config.bitrix24Domain === auth.domain;
            });
            
            if (!handler || !data.ID || !data.NAME) {
                console.log('⚠️ No handler or missing contact data');
                return;
            }
            
            const adminChatId = process.env.ADMIN_CHAT_ID || 'default_admin_chat_id';
            const message = 'New contact created: ' + data.NAME + ' (ID: ' + data.ID + ')';
            await handler.sendOutgoingMessage(adminChatId, message);
            console.log('✅ Contact notification sent to WhatsApp');
        } catch (error) {
            console.error('❌ Error handling new contact: ' + error);
        }
    }

    // --- Enhanced Socket.IO Logic ---
    io.on('connection', function(socket) {
        console.log('👤 User connected: ' + socket.id);

        socket.on('initialize_whatsapp', async function(data) {
            try {
                console.log('🔄 Initializing WhatsApp for user: ' + socket.id);
                console.log('📋 Received data: { domain: ' + data.domain + ', hasToken: ' + !!data.accessToken + ' }');
                
                if (!data.domain || !data.accessToken) {
                    console.error('❌ Missing domain or access token');
                    socket.emit('error', 'Missing domain or access token');
                    return;
                }
                
                activeConnections.set(socket.id, {
                    domain: data.domain,
                    accessToken: data.accessToken,
                    connectedAt: new Date()
                });
                
                const whatsappHandler = new WhatsAppBitrix24Handler({
                    bitrix24Domain: data.domain,
                    accessToken: data.accessToken,
                    connectorId: 'custom_whatsapp'
                });
                
                whatsappHandlers.set(socket.id, whatsappHandler);
                
                whatsappHandler.on('qr', function(qr) {
                    console.log('📱 QR Code received for socket: ' + socket.id);
                    console.log('📱 QR Code length: ' + qr.length);
                    console.log('📱 QR Code preview: ' + qr.substring(0, 50) + '...');
                    try {
                        socket.emit('qr_code', qr);
                        console.log('✅ QR Code emitted to client');
                    } catch (emitError) {
                        console.error('❌ Failed to emit QR code: ' + emitError);
                    }
                });
                
                whatsappHandler.on('status', function(status) {
                    console.log('📊 Status update for socket ' + socket.id + ': ' + status);
                    try {
                        socket.emit('status_update', status);
                    } catch (emitError) {
                        console.error('❌ Failed to emit status: ' + emitError);
                    }
                });
                
                whatsappHandler.on('connected', function() {
                    console.log('✅ WhatsApp connected for socket: ' + socket.id);
                    try {
                        socket.emit('whatsapp_connected');
                    } catch (emitError) {
                        console.error('❌ Failed to emit connected event: ' + emitError);
                    }
                });
                
                whatsappHandler.on('message_received', function(messageData) {
                    console.log('📨 Message received for socket ' + socket.id + ': ' + messageData.messageId);
                    try {
                        socket.emit('message_received', messageData);
                    } catch (emitError) {
                        console.error('❌ Failed to emit message: ' + emitError);
                    }
                });
                
                whatsappHandler.on('error', function(error) {
                    console.error('❌ WhatsApp handler error for socket ' + socket.id + ': ' + error);
                    try {
                        socket.emit('error', error.message || error);
                    } catch (emitError) {
                        console.error('❌ Failed to emit error: ' + emitError);
                    }
                });
                
                console.log('🚀 Starting WhatsApp initialization...');
                await whatsappHandler.initWhatsApp();
                
            } catch (error) {
                console.error('❌ Error initializing WhatsApp for socket ' + socket.id + ': ' + error);
                socket.emit('error', error.message);
                whatsappHandlers.delete(socket.id);
                activeConnections.delete(socket.id);
            }
        });

        socket.on('send_message', async function(data) {
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
                console.error('❌ Error sending message for socket ' + socket.id + ': ' + error);
                socket.emit('error', error.message);
            }
        });

        socket.on('send_whatsapp_message', async function(data) {
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (!handler) {
                    socket.emit('error', 'WhatsApp not connected');
                    return;
                }
                
                const { chatId, message } = data;
                await handler.sendOutgoingMessage(chatId, message);
                socket.emit('message_sent', { success: true });
            } catch (error) {
                console.error('❌ Error sending WhatsApp message for socket ' + socket.id + ': ' + error);
                socket.emit('error', error.message);
            }
        });

        socket.on('get_status', function() {
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
                console.error('❌ Error getting status for socket ' + socket.id + ': ' + error);
                socket.emit('error', 'Failed to get status');
            }
        });

        socket.on('disconnect_whatsapp', async function() {
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    console.log('🔌 Disconnecting WhatsApp for socket: ' + socket.id);
                    await handler.disconnect();
                    whatsappHandlers.delete(socket.id);
                }
                socket.emit('status_update', 'WhatsApp disconnected');
            } catch (error) {
                console.error('❌ Error disconnecting WhatsApp for socket ' + socket.id + ': ' + error);
                socket.emit('error', error.message);
            }
        });

        socket.on('disconnect', async function() {
            console.log('👋 User disconnected: ' + socket.id);
            try {
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    console.log('🧹 Cleaning up WhatsApp handler for socket: ' + socket.id);
                    await handler.cleanup();
                    whatsappHandlers.delete(socket.id);
                }
                activeConnections.delete(socket.id);
            } catch (error) {
                console.error('❌ Error during disconnect cleanup for socket ' + socket.id + ': ' + error);
            }
        });
    });

    // --- Express Routes ---
    app.get('/health', function(req, res) {
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            activeConnections: activeConnections.size,
            activeHandlers: whatsappHandlers.size
        });
    });

    app.get('/app', function(req, res) {
        const isEmbedded = req.headers['x-bitrix24-domain'] || req.query.DOMAIN;
        if (isEmbedded) {
            res.send(getBitrix24EmbeddedHTML());
        } else {
            res.send(getWhatsAppConnectorHTML());
        }
    });

    app.get('/handler.js', function(req, res) {
        res.send(getAppWidgetHTML());
    });
    
    app.get('/', function(req, res) {
        if (req.query.domain && req.query.access_token) {
            res.redirect('/app?domain=' + req.query.domain + '&access_token=' + req.query.access_token);
        } else {
            res.send(getInstallationHTML(req));
        }
    });

    app.get('/install.js', function(req, res) {
        console.log('📦 Install.js route accessed');
        console.log('📋 Query params: ' + JSON.stringify(req.query));
        console.log('📋 Headers: ' + JSON.stringify(req.headers));
        console.log('📋 Referer: ' + req.headers.referer);
        
        let domain = req.query.DOMAIN || req.query.domain;
        if (!domain && req.headers.referer) {
            try {
                const refererUrl = new URL(req.headers.referer);
                domain = refererUrl.hostname;
                console.log('🔍 Extracted domain from referer: ' + domain);
            } catch (e) {
                console.log('❌ Could not parse referer URL');
            }
        }
        
        if (!domain) {
            return res.send(getBitrix24DomainFormHTML());
        }
        
        console.log('🔐 Creating OAuth URL for domain: ' + domain);
        console.log('🔐 Using APP_ID: ' + process.env.APP_ID);
        console.log('🔐 Using scopes: ' + APP_SCOPE);
        
        const authUrl = `https://${domain}/oauth/authorize/?${querystring.stringify({
            client_id: process.env.APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${process.env.BASE_URL}/oauth/callback`
        })}`;
        
        console.log('🌐 OAuth URL: ' + authUrl);
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
                    console.log("Redirecting to: ${authUrl}");
                    window.location.href = "${authUrl}";
                </script>
            </body>
            </html>
        `);
    });

    app.post('/install.js', async function(req, res) {
        console.log('📦 POST Install.js route accessed');
        console.log('📋 Body: ' + JSON.stringify(req.body));
        console.log('📋 Headers: ' + JSON.stringify(req.headers));
        
        const authId = req.body.AUTH_ID;
        const memberId = req.body.member_id;
        const placement = req.body.PLACEMENT;
        
        if (authId && memberId) {
            console.log('✅ Bitrix24 installation request detected');
            console.log('🔑 AUTH_ID: ' + authId);
            console.log('👤 Member ID: ' + memberId);
            
            let domain = null;
            if (req.headers.referer) {
                try {
                    const refererUrl = new URL(req.headers.referer);
                    domain = refererUrl.hostname;
                    console.log('🔍 Extracted domain from referer: ' + domain);
                } catch (e) {
                    console.log('❌ Could not parse referer URL');
                }
            }
            
            if (!domain && req.headers.host) {
                console.log('🔍 Checking host header: ' + req.headers.host);
            }
            
            if (!domain && memberId) {
                console.log('🔍 Trying to use member_id for domain detection');
            }
            
            if (domain && domain.includes('bitrix24')) {
                console.log('🚀 Redirecting to OAuth for domain: ' + domain);
                const authUrl = 'https://' + domain + '/oauth/authorize/?' + querystring.stringify({
                    client_id: APP_ID,
                    response_type: 'code',
                    scope: APP_SCOPE,
                    redirect_uri: BASE_URL + '/oauth/callback'
                });
                return res.redirect(authUrl);
            } else {
                console.log('⚠️ Bitrix24 installation detected but no domain found');
                return res.send(getBitrix24InstallationFormHTML(authId, memberId));
            }
        }
        
        const domain = req.body.domain || req.body.DOMAIN;
        if (domain) {
            const authUrl = 'https://' + domain + '/oauth/authorize/?' + querystring.stringify({
                client_id: APP_ID,
                response_type: 'code',
                scope: APP_SCOPE,
                redirect_uri: BASE_URL + '/oauth/callback'
            });
            return res.redirect(authUrl);
        }
        
        console.log('❌ Insufficient data for installation');
        return res.status(400).send(getInstallationErrorHTML());
    });

    function getBitrix24InstallationFormHTML(authId, memberId) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Connector - Complete Installation</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
                                pattern="[a-zA-Z0-9.-]+\\.bitrix24\\.(com|net|ru|de|fr|es|it|pl|ua|kz|by)"
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
                    if (window.parent && window.parent.location) {
                        try {
                            const parentUrl = window.parent.location.href;
                            const match = parentUrl.match(/https?:\\/\\/([^\\/]+\\.bitrix24\\.[^\\/]+)/);
                            if (match) {
                                document.getElementById("domain").value = match[1];
                                console.log("Auto-detected domain: " + match[1]);
                            }
                        } catch (e) {
                            console.log("Could not auto-detect domain from parent window");
                        }
                    }
                    if (document.referrer) {
                        try {
                            const referrerUrl = new URL(document.referrer);
                            if (referrerUrl.hostname.includes("bitrix24")) {
                                document.getElementById("domain").value = referrerUrl.hostname;
                                console.log("Auto-detected domain from referrer: " + referrerUrl.hostname);
                            }
                        } catch (e) {
                            console.log("Could not parse referrer");
                        }
                    }
                </script>
            </body>
            </html>
        `;
    }

    app.get('/app', function(req, res) {
        console.log('🎯 App route accessed');
        console.log('📋 Query params: ' + JSON.stringify(req.query));
        console.log('📋 Headers: ' + JSON.stringify(req.headers));
        
        const domain = req.query.domain || req.query.DOMAIN;
        const accessToken = req.query.access_token || req.query.AUTH_ID;
        const isEmbedded = req.headers['x-bitrix24-domain'] || domain;
        
        if (isEmbedded) {
            res.send(getBitrix24EmbeddedHTML());
        } else {
            res.send(getWhatsAppConnectorHTML());
        }
    });

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
                    if (document.referrer) {
                        try {
                            const url = new URL(document.referrer);
                            if (url.hostname.includes("bitrix24")) {
                                document.querySelector("input[name='domain']").value = url.hostname;
                            }
                        } catch (e) {
                            console.log("Could not auto-detect domain");
                        }
                    }
                </script>
            </body>
            </html>
        `;
    }

    app.get('/debug-install', function(req, res) {
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

    app.get('/oauth/callback', async function(req, res) {
        console.log('🔐 OAuth callback received');
        console.log('📋 Query params: ' + JSON.stringify(req.query));
        
        try {
            const { code, domain, state } = req.query;
            if (!code) throw new Error('Missing authorization code');
            if (!domain) throw new Error('Missing domain parameter');
            
            console.log('🔄 Exchanging code for token...');
            console.log('🌐 Domain: ' + domain);
            console.log('🔑 Code: ' + code.substring(0, 20) + '...');

            const tokenData = {
                grant_type: 'authorization_code',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                code: code,
                scope: APP_SCOPE
            };

            const tokenResponse = await axios.post(
                'https://' + domain + '/oauth/token/', 
                querystring.stringify(tokenData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            
            console.log('📊 Token response status: ' + tokenResponse.status);
            const { access_token, refresh_token } = tokenResponse.data;

            if (!access_token) throw new Error('Failed to obtain access token from Bitrix24');

            console.log('✅ Access token received');
            console.log('🚀 Running installation logic...');

            const customApp = new CustomChannelApp(domain, access_token);
            const installResult = await customApp.install();

            console.log('📋 Installation result: ' + (installResult.success ? '✅ Success' : '❌ Failed'));

            const redirectUrl = '/app?domain=' + domain + '&access_token=' + access_token + '&installation=' + (installResult.success ? 'success' : 'partial');
            console.log('🔄 Redirecting to: ' + redirectUrl);
            res.redirect(redirectUrl);
        } catch (error) {
            console.error('❌ OAuth callback error: ' + error.message);
            let errorHtml = (
                '<html>' +
                '<head><title>Installation Error</title></head>' +
                '<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">' +
                '<div style="background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px;">' +
                '<h2>❌ Installation Failed</h2>' +
                '<p><strong>Error:</strong> ' + error.message + '</p>' +
                '<p><a href="/">← Try Again</a></p>' +
                '</div>' +
                '</body>' +
                '</html>'
            );
            res.status(500).send(errorHtml);
        }
    });

    function getAppWidgetHTML() {
        return (
            '<!DOCTYPE html>' +
            '<html>' +
            '<head><title>Handler JS</title></head>' +
            '<body>' +
            '<h2>This would typically serve a JS file or widget</h2>' +
            '</body>' +
            '</html>'
        );
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
            </html>
        `;
    }

    function getBitrix24EmbeddedHTML() {
        return `
            <!DOCTYPE html>
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
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
                                <div class="step-title">Scan QR Code</div>
                            </div>
                            <div class="qr-container hidden" id="qrContainer">
                                <canvas id="qrCode" class="qr-code"></canvas>
                                <p>Scan this QR code with your WhatsApp app to connect.</p>
                            </div>
                            <div id="qrStatus" class="status info hidden">Waiting for QR scan...</div>
                        </div>
                        <div class="step" id="step3">
                            <div class="step-header">
                                <div class="step-number">3</div>
                                <div class="step-title">Connection Status</div>
                            </div>
                            <div id="connectionStatus" class="status info">Not connected</div>
                            <div class="connection-info hidden" id="connectionInfo">
                                <div class="info-card">
                                    <h4>Status</h4>
                                    <p id="statusText">Disconnected</p>
                                </div>
                                <div class="info-card">
                                    <h4>Connected Since</h4>
                                    <p id="connectedSince">-</p>
                                </div>
                                <div class="info-card">
                                    <h4>Last Message</h4>
                                    <p id="lastMessage">-</p>
                                </div>
                            </div>
                            <button class="btn btn-danger hidden" id="disconnectBtn">Disconnect WhatsApp</button>
                        </div>
                    </div>
                </div>
                <script>
                    let socket;
                    let qrGenerated = false;
                    let isConnected = false;
                    const debugLog = document.getElementById("debugLog");
                    function log(message) {
                        const logEntry = document.createElement("div");
                        logEntry.textContent = \`\${new Date().toLocaleTimeString()} - \${message}\`;
                        debugLog.appendChild(logEntry);
                        debugLog.scrollTop = debugLog.scrollHeight;
                    }
                    BX24.init(function() {
                        log("Bitrix24 API initialized");
                        BX24.callMethod("user.current", {}, function(result) {
                            if (result.error()) {
                                document.getElementById("bitrixStatus").className = "status error";
                                document.getElementById("bitrixStatus").textContent = "Bitrix24 connection failed";
                                log("Bitrix24 connection failed: " + result.error().getDescription());
                            } else {
                                document.getElementById("bitrixStatus").className = "status success";
                                document.getElementById("bitrixStatus").textContent = "Connected to Bitrix24 as " + result.data().NAME;
                                log("Connected to Bitrix24 as " + result.data().NAME);
                                BX24.callMethod("profile", {}, function(profileResult) {
                                    if (!profileResult.error()) {
                                        const domain = profileResult.data().DOMAIN;
                                        BX24.callMethod("app.option.get", {}, function(optionsResult) {
                                            const accessToken = optionsResult.data().access_token || null;
                                            if (!accessToken) {
                                                BX24.install(function() {
                                                    log("Requesting installation permissions");
                                                });
                                            } else {
                                                connectSocket(domain, accessToken);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    });
                    function connectSocket(domain, accessToken) {
                        socket = io({ transports: ["websocket"] });
                        socket.on("connect", function() {
                            log("Socket.IO connected");
                            socket.emit("initialize_whatsapp", { domain: domain, accessToken: accessToken });
                            document.getElementById("step1").classList.remove("active");
                            document.getElementById("step2").classList.add("active");
                        });
                        socket.on("qr_code", function(qr) {
                            if (!qrGenerated) {
                                log("Generating QR code");
                                const qrCode = new QRious({
                                    element: document.getElementById("qrCode"),
                                    value: qr,
                                    size: 200,
                                });
                                document.getElementById("qrContainer").classList.remove("hidden");
                                document.getElementById("qrStatus").classList.remove("hidden");
                                qrGenerated = true;
                            }
                        });
                        socket.on("status_update", function(status) {
                            log("Status update: " + status);
                            document.getElementById("qrStatus").textContent = status;
                            document.getElementById("connectionStatus").textContent = status;
                        });
                        socket.on("whatsapp_connected", function() {
                            log("WhatsApp connected");
                            document.getElementById("step2").classList.remove("active");
                            document.getElementById("step3").classList.add("active");
                            document.getElementById("qrContainer").classList.add("hidden");
                            document.getElementById("qrStatus").classList.add("hidden");
                            document.getElementById("connectionStatus").className = "status success";
                            document.getElementById("connectionStatus").textContent = "Connected to WhatsApp";
                            document.getElementById("connectionInfo").classList.remove("hidden");
                            document.getElementById("statusText").textContent = "Connected";
                            document.getElementById("connectedSince").textContent = new Date().toLocaleString();
                            document.getElementById("disconnectBtn").classList.remove("hidden");
                            isConnected = true;
                        });
                        socket.on("message_received", function(messageData) {
                            log("Message received: " + messageData.messageId);
                            document.getElementById("lastMessage").textContent = new Date().toLocaleString();
                        });
                        socket.on("error", function(error) {
                            log("Error: " + error);
                            document.getElementById("connectionStatus").className = "status error";
                            document.getElementById("connectionStatus").textContent = "Error: " + error;
                            document.getElementById("qrContainer").classList.add("hidden");
                            document.getElementById("qrStatus").classList.add("hidden");
                        });
                        socket.on("disconnect", function() {
                            log("Socket.IO disconnected");
                            document.getElementById("connectionStatus").className = "status error";
                            document.getElementById("connectionStatus").textContent = "Disconnected";
                            document.getElementById("connectionInfo").classList.add("hidden");
                            document.getElementById("disconnectBtn").classList.add("hidden");
                            isConnected = false;
                            qrGenerated = false;
                        });
                    }
                    document.getElementById("disconnectBtn").addEventListener("click", function() {
                        if (socket && isConnected) {
                            socket.emit("disconnect_whatsapp");
                            log("Disconnecting WhatsApp");
                            document.getElementById("connectionStatus").className = "status info";
                            document.getElementById("connectionStatus").textContent = "Disconnecting...";
                            document.getElementById("step3").classList.remove("active");
                            document.getElementById("step2").classList.add("active");
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    function getWhatsAppConnectorHTML() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Connector - Standalone</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .info { background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <h2>📱 WhatsApp Connector</h2>
                <div class="info">
                    <p>This is the standalone version of the WhatsApp Connector.</p>
                    <p>For the full experience, please install this app in your Bitrix24 portal.</p>
                    <p><a href="/">← Back to Installation</a></p>
                </div>
            </body>
            </html>
        `;
    }

    function getInstallationErrorHTML() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Installation Error</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>❌ Installation Error</h2>
                    <p>There was an error during installation. Please try again.</p>
                    <p><a href="/">← Try Again</a></p>
                </div>
            </body>
            </html>
        `;
    }

    // Start the server
    server.listen(PORT, function() {
        console.log('🚀 Server running on port ' + PORT);
        console.log('🌐 Base URL: ' + BASE_URL);
        console.log('🔑 App ID: ' + APP_ID);
        console.log('📋 OAuth Scopes: ' + APP_SCOPE);
        console.log('✅ WhatsApp Connector Server is ready!');
    });

} catch (error) {
    console.error('❌ FATAL ERROR during server startup:');
    console.error('Error message: ' + error.message);
    console.error('Stack trace: ' + error.stack);
    console.error('📋 Environment variables check:');
    console.error('- PORT: ' + process.env.PORT);
    console.error('- APP_ID: ' + (process.env.APP_ID ? '✅ Set' : '❌ Missing'));
    console.error('- APP_SECRET: ' + (process.env.APP_SECRET ? '✅ Set' : '❌ Missing'));
    console.error('- BASE_URL: ' + process.env.BASE_URL);
    console.error('🔧 Please check your environment variables and dependencies.');
    process.exit(1);
}
