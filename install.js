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
        // TODO: Implement lead handling logic
        // Example: Send WhatsApp notification about new lead
    }
    
    async function handleNewContact(data, auth) { 
        console.log('👤 New contact created:', data); 
        // TODO: Implement contact handling logic
        // Example: Create corresponding WhatsApp contact
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
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Connector</title>
        </head>
        <body>
            <h2>WhatsApp Connector Interface</h2>
            <!-- Add your WhatsApp connector HTML here -->
        </body>
        </html>`;
    }

    // --- Start Server ---
    server.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 Base URL: ${BASE_URL}`);
    });

    // --- Graceful Shutdown ---
    process.on('SIGTERM', async () => {
        console.log('🛑 SIGTERM received. Shutting down gracefully...');
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
    });

    // --- Unhandled Error Handling ---
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

} catch (error) {
    console.error('❌ Fatal error in install.js:', error);
    process.exit(1);
}
