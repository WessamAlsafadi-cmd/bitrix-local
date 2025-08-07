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
    const BASE_URL = process.env.BASE_URL || 'https://bitrix-local.onrender.com';
    console.log('SUCCESS: Configuration loaded.');
    console.log('📋 Using OAuth scopes: ' + APP_SCOPE);

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    console.log('🚀 Bitrix24 WhatsApp Connector Server configuration complete.');

    // Store WhatsApp handler instances per socket with better management
    const whatsappHandlers = new Map();
    const activeConnections = new Map();
    const connectionCleanupTimeouts = new Map();

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

    // Enhanced Socket.IO Logic with better error handling and QR management
    io.on('connection', function(socket) {
        console.log('👤 User connected:', socket.id, 'at', new Date().toISOString());
        console.log('📊 Total connections:', io.engine.clientsCount);
        
        // Send initial connection confirmation
        socket.emit('connection_confirmed', {
            socketId: socket.id,
            timestamp: new Date().toISOString(),
            serverStatus: 'ready'
        });

        // Enhanced WhatsApp initialization with better error handling
        socket.on('initialize_whatsapp', async function(data) {
            try {
                console.log('🔄 WhatsApp initialization request from:', socket.id);
                console.log('📋 Initialization data:', {
                    domain: data.domain,
                    hasAccessToken: !!data.accessToken,
                    connectorId: data.connectorId,
                    timestamp: new Date().toISOString()
                });
                
                // Validate required parameters
                if (!data.domain || !data.accessToken) {
                    console.error('❌ Missing required parameters for socket:', socket.id);
                    socket.emit('error', {
                        type: 'missing_params',
                        message: 'Missing domain or access token',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                
                // Validate domain format
                if (!data.domain.includes('bitrix24')) {
                    console.error('❌ Invalid domain format for socket:', socket.id);
                    socket.emit('error', {
                        type: 'invalid_domain',
                        message: 'Invalid Bitrix24 domain format',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                
                // Clean up any existing handler for this socket
                await cleanupSocketHandler(socket.id);
                
                // Store connection info
                activeConnections.set(socket.id, {
                    domain: data.domain,
                    accessToken: data.accessToken,
                    connectedAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    status: 'initializing'
                });
                
                console.log('🏗️ Creating WhatsApp handler for socket:', socket.id);
                
                // Create new WhatsApp handler with enhanced configuration
                const whatsappHandler = new WhatsAppBitrix24Handler({
                    bitrix24Domain: data.domain,
                    accessToken: data.accessToken,
                    connectorId: data.connectorId || 'custom_whatsapp',
                    authDir: `./auth_${socket.id}`, // Unique auth directory per socket
                    socketId: socket.id
                });
                
                // Store the handler
                whatsappHandlers.set(socket.id, whatsappHandler);
                
                // Set up enhanced event listeners with error handling
                setupHandlerEventListeners(socket, whatsappHandler);
                
                // Update connection status
                const connection = activeConnections.get(socket.id);
                if (connection) {
                    connection.status = 'handler_created';
                    connection.lastActivity = new Date().toISOString();
                }
                
                console.log('🚀 Starting WhatsApp initialization for socket:', socket.id);
                socket.emit('status_update', {
                    type: 'info',
                    message: 'Initializing WhatsApp connection...',
                    timestamp: new Date().toISOString()
                });
                
                // Initialize WhatsApp with timeout protection
                const initTimeout = setTimeout(() => {
                    console.warn('⚠️ WhatsApp initialization timeout for socket:', socket.id);
                    socket.emit('error', {
                        type: 'init_timeout',
                        message: 'WhatsApp initialization timed out. Please try again.',
                        timestamp: new Date().toISOString()
                    });
                }, 60000); // 60 second timeout
                
                try {
                    await whatsappHandler.initWhatsApp();
                    clearTimeout(initTimeout);
                } catch (initError) {
                    clearTimeout(initTimeout);
                    throw initError;
                }
                
            } catch (error) {
                console.error('❌ Error initializing WhatsApp for socket', socket.id + ':', error.message);
                console.error('📊 Error stack:', error.stack);
                
                socket.emit('error', {
                    type: 'init_error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
                
                // Cleanup on error
                await cleanupSocketHandler(socket.id);
            }
        });

        // Enhanced message sending with validation
        socket.on('send_message', async function(data) {
            try {
                console.log('📤 Send message request from socket:', socket.id);
                
                const handler = whatsappHandlers.get(socket.id);
                if (!handler) {
                    socket.emit('error', {
                        type: 'no_handler',
                        message: 'WhatsApp not connected. Please initialize first.',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                
                // Validate message data
                if (!data.chatId || !data.message) {
                    socket.emit('error', {
                        type: 'invalid_message_data',
                        message: 'Missing chatId or message content',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                
                // Update last activity
                const connection = activeConnections.get(socket.id);
                if (connection) {
                    connection.lastActivity = new Date().toISOString();
                }
                
                const { chatId, message, files } = data;
                console.log('📨 Sending message to:', chatId, 'length:', message.length);
                
                await handler.sendOutgoingMessage(chatId, message, files);
                
                socket.emit('message_sent', { 
                    success: true,
                    chatId: chatId,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('❌ Error sending message for socket', socket.id + ':', error.message);
                socket.emit('error', {
                    type: 'send_error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Simplified send_whatsapp_message (alias for send_message)
        socket.on('send_whatsapp_message', function(data) {
            socket.emit('send_message', data);
        });

        // Enhanced status request with detailed info
        socket.on('get_status', function() {
            try {
                const handler = whatsappHandlers.get(socket.id);
                const connection = activeConnections.get(socket.id);
                
                let status = {
                    connected: false,
                    whatsappConnected: false,
                    activeSessions: 0,
                    socketId: socket.id,
                    timestamp: new Date().toISOString()
                };
                
                if (handler) {
                    const handlerStatus = handler.getConnectionStatus();
                    status = {
                        ...status,
                        ...handlerStatus,
                        connected: true
                    };
                }
                
                if (connection) {
                    status.connectionInfo = {
                        domain: connection.domain,
                        connectedAt: connection.connectedAt,
                        lastActivity: connection.lastActivity,
                        status: connection.status
                    };
                }
                
                console.log('📊 Status request from socket:', socket.id, 'Status:', status.whatsappConnected ? 'Connected' : 'Disconnected');
                socket.emit('status_response', status);
                
            } catch (error) {
                console.error('❌ Error getting status for socket', socket.id + ':', error.message);
                socket.emit('error', {
                    type: 'status_error',
                    message: 'Failed to get status',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Enhanced disconnect handling
        socket.on('disconnect_whatsapp', async function() {
            try {
                console.log('🔌 Manual WhatsApp disconnect requested by socket:', socket.id);
                await cleanupSocketHandler(socket.id);
                
                socket.emit('status_update', {
                    type: 'info',
                    message: 'WhatsApp disconnected',
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('❌ Error disconnecting WhatsApp for socket', socket.id + ':', error.message);
                socket.emit('error', {
                    type: 'disconnect_error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Restart connection functionality
        socket.on('restart_connection', async function() {
            try {
                console.log('🔄 Connection restart requested by socket:', socket.id);
                
                const handler = whatsappHandlers.get(socket.id);
                if (handler) {
                    socket.emit('status_update', {
                        type: 'info',
                        message: 'Restarting WhatsApp connection...',
                        timestamp: new Date().toISOString()
                    });
                    
                    await handler.restartConnection();
                } else {
                    socket.emit('error', {
                        type: 'no_handler',
                        message: 'No active WhatsApp connection to restart',
                        timestamp: new Date().toISOString()
                    });
                }
                
            } catch (error) {
                console.error('❌ Error restarting connection for socket', socket.id + ':', error.message);
                socket.emit('error', {
                    type: 'restart_error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Ping/pong for connection health monitoring
        socket.on('ping', function() {
            const connection = activeConnections.get(socket.id);
            if (connection) {
                connection.lastActivity = new Date().toISOString();
            }
            socket.emit('pong', { timestamp: new Date().toISOString() });
        });

        // Handle client disconnect with cleanup
        socket.on('disconnect', async function(reason) {
            console.log('👋 User disconnected:', socket.id, 'Reason:', reason, 'at', new Date().toISOString());
            
            try {
                // Set cleanup timeout to allow for reconnection
                const cleanupTimeout = setTimeout(async () => {
                    console.log('🧹 Cleaning up resources for socket:', socket.id);
                    await cleanupSocketHandler(socket.id);
                }, 30000); // 30 second grace period
                
                connectionCleanupTimeouts.set(socket.id, cleanupTimeout);
                
            } catch (error) {
                console.error('❌ Error during disconnect cleanup for socket', socket.id + ':', error.message);
            }
            
            console.log('📊 Remaining connections:', io.engine.clientsCount);
        });
    });

    // Helper function to setup handler event listeners
    function setupHandlerEventListeners(socket, handler) {
        // QR code handling with enhanced error management
        handler.on('qr', function(qr) {
            console.log('📱 QR Code generated for socket:', socket.id);
            console.log('📱 QR Code stats:', {
                length: qr.length,
                preview: qr.substring(0, 50) + '...',
                timestamp: new Date().toISOString()
            });
            
            try {
                socket.emit('qr_code', {
                    qr: qr,
                    timestamp: new Date().toISOString()
                });
                console.log('✅ QR Code emitted to socket:', socket.id);
            } catch (emitError) {
                console.error('❌ Failed to emit QR code to socket', socket.id + ':', emitError.message);
                socket.emit('error', {
                    type: 'qr_emit_error',
                    message: 'Failed to send QR code to client',
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Status updates with enhanced formatting
        handler.on('status', function(status) {
            console.log('📊 Status update for socket', socket.id + ':', status);
            
            try {
                socket.emit('status_update', {
                    type: 'info',
                    message: status,
                    timestamp: new Date().toISOString()
                });
                
                // Update connection status
                const connection = activeConnections.get(socket.id);
                if (connection) {
                    connection.status = status;
                    connection.lastActivity = new Date().toISOString();
                }
                
            } catch (emitError) {
                console.error('❌ Failed to emit status to socket', socket.id + ':', emitError.message);
            }
        });
        
        // Connection success handling
        handler.on('connected', function() {
            console.log('✅ WhatsApp connected successfully for socket:', socket.id);
            
            try {
                socket.emit('whatsapp_connected', {
                    timestamp: new Date().toISOString(),
                    message: 'WhatsApp connected successfully!'
                });
                
                // Update connection status
                const connection = activeConnections.get(socket.id);
                if (connection) {
                    connection.status = 'connected';
                    connection.lastActivity = new Date().toISOString();
                }
                
            } catch (emitError) {
                console.error('❌ Failed to emit connected event to socket', socket.id + ':', emitError.message);
            }
        });
        
        // Message received handling
        handler.on('message_received', function(messageData) {
            console.log('📨 Message received for socket', socket.id + ':', {
                messageId: messageData.messageId,
                from: messageData.from,
                preview: messageData.text ? messageData.text.substring(0, 50) + '...' : '[No text]'
            });
            
            try {
                socket.emit('message_received', {
                    ...messageData,
                    timestamp: new Date().toISOString()
                });
                
                // Update last activity
                const connection = activeConnections.get(socket.id);
                if (connection) {
                    connection.lastActivity = new Date().toISOString();
                }
                
            } catch (emitError) {
                console.error('❌ Failed to emit message to socket', socket.id + ':', emitError.message);
            }
        });
        
        // Error handling with categorization
        handler.on('error', function(error) {
            console.error('❌ WhatsApp handler error for socket', socket.id + ':', error);
            
            try {
                socket.emit('error', {
                    type: 'handler_error',
                    message: typeof error === 'string' ? error : error.message || 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            } catch (emitError) {
                console.error('❌ Failed to emit error to socket', socket.id + ':', emitError.message);
            }
        });
    }

    // Enhanced cleanup function
    async function cleanupSocketHandler(socketId) {
        try {
            console.log('🧹 Cleaning up handler for socket:', socketId);
            
            // Clear cleanup timeout if exists
            const cleanupTimeout = connectionCleanupTimeouts.get(socketId);
            if (cleanupTimeout) {
                clearTimeout(cleanupTimeout);
                connectionCleanupTimeouts.delete(socketId);
            }
            
            // Cleanup WhatsApp handler
            const handler = whatsappHandlers.get(socketId);
            if (handler) {
                console.log('🔌 Disconnecting WhatsApp handler for socket:', socketId);
                await handler.cleanup();
                whatsappHandlers.delete(socketId);
            }
            
            // Remove connection info
            activeConnections.delete(socketId);
            
            console.log('✅ Cleanup completed for socket:', socketId);
            console.log('📊 Active handlers:', whatsappHandlers.size, 'Active connections:', activeConnections.size);
            
        } catch (error) {
            console.error('❌ Error during cleanup for socket', socketId + ':', error.message);
        }
    }

    // Periodic cleanup of stale connections
    setInterval(() => {
        const now = Date.now();
        const staleThreshold = 10 * 60 * 1000; // 10 minutes
        
        activeConnections.forEach((connection, socketId) => {
            const lastActivity = new Date(connection.lastActivity).getTime();
            if (now - lastActivity > staleThreshold) {
                console.log('🗑️ Cleaning up stale connection:', socketId);
                cleanupSocketHandler(socketId).catch(err => {
                    console.error('❌ Error cleaning stale connection:', err.message);
                });
            }
        });
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Connection monitoring endpoint
    app.get('/admin/connections', function(req, res) {
        const connections = [];
        activeConnections.forEach((connection, socketId) => {
            const handler = whatsappHandlers.get(socketId);
            connections.push({
                socketId,
                ...connection,
                handlerStatus: handler ? handler.getConnectionStatus() : null
            });
        });
        
        res.json({
            timestamp: new Date().toISOString(),
            totalConnections: activeConnections.size,
            totalHandlers: whatsappHandlers.size,
            socketIoConnections: io.engine.clientsCount,
            connections
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

    // FIXED: Main app route - no more redirects, embedded interface only
    app.get('/app', function(req, res) {
        console.log('🎯 App route accessed');
        console.log('📋 Query params:', req.query);
        console.log('📋 Headers:', req.headers);
        
        const domain = req.query.domain || req.query.DOMAIN;
        const accessToken = req.query.access_token || req.query.AUTH_ID;
        
        // Always serve the embedded interface - NO REDIRECTS
        res.send(getBitrix24EmbeddedHTML(domain, accessToken));
    });

    app.get('/handler.js', function(req, res) {
        res.send(getAppWidgetHTML());
    });
    
    // FIXED: Root route - serve embedded interface directly for Bitrix24
    app.get('/', function(req, res) {
        console.log('🏠 Root route accessed');
        console.log('📋 Query params:', req.query);
        console.log('📋 Headers:', req.headers);
        console.log('📋 Referer:', req.headers.referer);
        
        const domain = req.query.domain || req.query.DOMAIN;
        const accessToken = req.query.access_token || req.query.AUTH_ID;
        
        // Check if this is coming from Bitrix24
        const isBitrix24Request = req.headers.referer && req.headers.referer.includes('bitrix24');
        
        if (isBitrix24Request || (domain && accessToken)) {
            console.log('🎯 Bitrix24 request detected, serving embedded interface');
            res.send(getBitrix24EmbeddedHTML(domain, accessToken));
        } else {
            // Only show installation page for non-Bitrix24 requests
            res.send(getInstallationHTML());
        }
    });

    // FIXED: install.js route - handle Bitrix24 app installation without redirects
    app.get('/install.js', (req, res) => {
        console.log('📦 GET /install.js route accessed');
        console.log('📋 Query params:', req.query);
        console.log('📋 Headers:', req.headers);
        console.log('📋 Referer:', req.headers.referer);
        
        // For Bitrix24 marketplace installations, serve the embedded app directly
        const isBitrix24Context = req.headers.referer && req.headers.referer.includes('bitrix24');
        
        if (isBitrix24Context) {
            console.log('🎯 Bitrix24 marketplace installation detected');
            res.send(getBitrix24EmbeddedHTML(null, null));
            return;
        }
        
        let domain = req.query.DOMAIN || req.query.domain;
        
        // Try to extract domain from referer if not provided
        if (!domain && req.headers.referer) {
            try {
                const refererUrl = new URL(req.headers.referer);
                domain = refererUrl.hostname;
                console.log('🔍 Extracted domain from referer:', domain);
            } catch (e) {
                console.log('❌ Could not parse referer URL');
            }
        }
        
        if (!domain) {
            console.log('❌ No domain found, showing domain form');
            return res.send(getBitrix24DomainFormHTML());
        }
        
        if (!domain.includes('bitrix24')) {
            console.log('❌ Invalid domain format:', domain);
            return res.send(getDomainErrorHTML('Domain must be a valid Bitrix24 domain'));
        }
        
        // For manual installations, create OAuth URL
        console.log('🔐 Creating OAuth URL for domain:', domain);
        
        const authUrl = `https://${domain}/oauth/authorize/?` + querystring.stringify({
            client_id: APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${BASE_URL}/oauth/callback`,
            state: encodeURIComponent(JSON.stringify({ domain }))
        });
        
        console.log('🌐 OAuth URL generated:', authUrl);
        res.send(getInstallationRedirectHTML(domain, authUrl));
    });
    
    // OAuth test route
    app.get('/test-oauth/:domain', function(req, res) {
        const domain = req.params.domain;
        const authUrl = `https://${domain}/oauth/authorize/?${querystring.stringify({
            client_id: process.env.APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${process.env.BASE_URL}/oauth/callback`,
            state: encodeURIComponent(JSON.stringify({ domain: domain }))
        })}`;
        
        res.json({
            domain: domain,
            authUrl: authUrl,
            config: {
                APP_ID: process.env.APP_ID,
                BASE_URL: process.env.BASE_URL,
                REDIRECT_URI: `${process.env.BASE_URL}/oauth/callback`
            }
        });
    });

    // FIXED: POST install.js - handle Bitrix24 installation without redirects
    app.post('/install.js', async (req, res) => {
        console.log('📦 POST /install.js route accessed at', new Date().toISOString());
        console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
        console.log('📋 Request headers:', JSON.stringify({
            'user-agent': req.headers['user-agent'],
            'referer': req.headers.referer,
            'origin': req.headers.origin,
            'host': req.headers.host
        }, null, 2));
        
        const authId = req.body.AUTH_ID;
        const authExpires = req.body.AUTH_EXPIRES;
        const refreshId = req.body.REFRESH_ID;
        const memberId = req.body.member_id;
        const status = req.body.status;
        const placement = req.body.PLACEMENT;
        
                    // Check if this is a Bitrix24 installation request
        if (authId && memberId && status) {
            console.log('✅ Bitrix24 installation request detected');
            console.log('🔑 AUTH_ID:', authId.substring(0, 20) + '...');
            console.log('👤 Member ID:', memberId);
            console.log('📊 Status:', status);
            console.log('🎯 Placement:', placement);
            
            // Extract domain from referer
            let domain = null;
            if (req.headers.referer) {
                try {
                    const refererUrl = new URL(req.headers.referer);
                    domain = refererUrl.hostname;
                    console.log('🔍 Extracted domain from referer:', domain);
                } catch (e) {
                    console.error('❌ Could not parse referer URL:', req.headers.referer);
                }
            }
            
            // For Bitrix24 app installation, serve embedded interface directly
            if (domain && domain.includes('bitrix24')) {
                console.log('🎯 Serving embedded WhatsApp interface for Bitrix24 installation');
                
                // Return the embedded app interface directly - NO REDIRECT
                return res.send(getBitrix24AppInstallationHTML(domain, authId, memberId, placement));
            } else {
                console.log('⚠️ Bitrix24 installation detected but no valid domain found');
                return res.send(getBitrix24InstallationFormHTML(authId, memberId));
            }
        }
        
        // Handle manual domain submission
        const manualDomain = req.body.domain || req.body.DOMAIN;
        if (manualDomain) {
            console.log('🔄 Processing manual domain submission:', manualDomain);
            
            // Validate domain format
            if (!manualDomain.includes('bitrix24')) {
                return res.status(400).send(getDomainErrorHTML('Invalid domain format. Must be a Bitrix24 domain.'));
            }
            
            const authUrl = `https://${manualDomain}/oauth/authorize/?` + querystring.stringify({
                client_id: APP_ID,
                response_type: 'code',
                scope: APP_SCOPE,
                redirect_uri: `${BASE_URL}/oauth/callback`,
                state: encodeURIComponent(JSON.stringify({ domain: manualDomain }))
            });
            
            return res.redirect(authUrl);
        }
        
        console.log('❌ Insufficient data for installation');
        return res.status(400).send(getInstallationErrorHTML());
    });

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

    app.get('/oauth/callback', async (req, res) => {
        console.log('🔐 OAuth callback received at', new Date().toISOString());
        console.log('📋 Query params:', req.query);
        console.log('📋 Headers:', req.headers);
        
        const code = req.query.code;
        const error = req.query.error;
        const errorDescription = req.query.error_description;
        
        // Handle OAuth errors
        if (error) {
            console.error('❌ OAuth error:', error, errorDescription);
            return res.status(400).send(getOAuthErrorHTML(error, errorDescription));
        }
        
        if (!code) {
            console.error('❌ No authorization code received');
            return res.status(400).send(getOAuthErrorHTML('missing_code', 'Authorization code missing'));
        }

        // Extract domain from state or use fallback methods
        let domain = null;
        try {
            if (req.query.state) {
                const state = JSON.parse(decodeURIComponent(req.query.state));
                domain = state.domain;
            }
        } catch (e) {
            console.log('⚠️ Could not parse state parameter');
        }
        
        // Fallback domain detection
        if (!domain) {
            domain = req.query.domain || 'testhamidjuly25.bitrix24.in';
            console.log('🔍 Using fallback domain:', domain);
        }

        try {
            console.log('🔄 Exchanging authorization code for access token...');
            const tokenUrl = `https://${domain}/oauth/token/`;
            const tokenParams = {
                client_id: APP_ID,
                client_secret: APP_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: `${BASE_URL}/oauth/callback`
            };
            
            console.log('📤 Token request URL:', tokenUrl);
            console.log('📤 Token params (without secrets):', {
                client_id: tokenParams.client_id,
                grant_type: tokenParams.grant_type,
                redirect_uri: tokenParams.redirect_uri
            });
            
            const tokenResponse = await axios.post(tokenUrl, querystring.stringify(tokenParams), {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'WhatsApp-Bitrix24-Connector/1.0'
                },
                timeout: 15000
            });
            
            console.log('✅ Token exchange successful');
            console.log('📊 Token response keys:', Object.keys(tokenResponse.data));
            
            const accessToken = tokenResponse.data.access_token;
            const refreshToken = tokenResponse.data.refresh_token;
            
            if (!accessToken) {
                throw new Error('No access token received from Bitrix24');
            }
            
            console.log('🎯 Redirecting to app with credentials...');
            
            // Test the connection before redirecting
            try {
                const testUrl = `https://${domain}/rest/profile`;
                const testResponse = await axios.post(testUrl, { access_token: accessToken });
                console.log('✅ Access token validation successful');
            } catch (testError) {
                console.warn('⚠️ Access token test failed:', testError.message);
                // Continue anyway as some tokens might work despite test failure
            }
            
            // Redirect to app with credentials
            const appUrl = `/app?domain=${encodeURIComponent(domain)}&access_token=${encodeURIComponent(accessToken)}`;
            res.redirect(appUrl);
            
        } catch (error) {
            console.error('❌ Token exchange failed:', error.message);
            if (error.response) {
                console.error('📊 Error response status:', error.response.status);
                console.error('📊 Error response data:', error.response.data);
            }
            res.status(500).send(getTokenExchangeErrorHTML(error));
        }
    });

    app.get('/debug/config', function(req, res) {
        res.json({
            timestamp: new Date().toISOString(),
            config: {
                APP_ID: process.env.APP_ID || 'NOT_SET',
                APP_SECRET: process.env.APP_SECRET ? 'SET' : 'NOT_SET',
                BASE_URL: process.env.BASE_URL || 'NOT_SET',
                PORT: process.env.PORT || '3000',
                NODE_ENV: process.env.NODE_ENV || 'NOT_SET'
            },
            urls: {
                oauth_callback: `${process.env.BASE_URL}/oauth/callback`,
                app_url: `${process.env.BASE_URL}/app`,
                health_check: `${process.env.BASE_URL}/health`
            }
        });
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

    function getInstallationHTML() {
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

    // NEW: Fixed Bitrix24 app installation HTML - no redirects, embedded interface
    function getBitrix24AppInstallationHTML(domain, authId, memberId, placement) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WhatsApp Connector - Bitrix24 Installation</title>
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
                    .installation-info {
                        background: #e8f5e8;
                        border: 1px solid #25D366;
                        border-radius: 8px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .installation-info h3 {
                        color: #25D366;
                        margin-bottom: 10px;
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📱 WhatsApp Connector</h1>
                        <p>Successfully installed in Bitrix24!</p>
                    </div>
                    <div class="content">
                        <div class="installation-info">
                            <h3>✅ Installation Complete</h3>
                            <p><strong>Domain:</strong> ${domain || 'Detected automatically'}</p>
                            <p><strong>Installation ID:</strong> ${authId ? authId.substring(0, 20) + '...' : 'Auto-generated'}</p>
                            <p><strong>Placement:</strong> ${placement || 'Default'}</p>
                        </div>
                        
                        <div class="debug-log" id="debugLog">
                            <div>🔧 Bitrix24 Installation Mode - Ready</div>
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
                                <div class="step-title">WhatsApp Connection</div>
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
                    
                    // Initialize Bitrix24 API and auto-connect
                    BX24.init(function() {
                        log("Bitrix24 API initialized for installation");
                        
                        // Get current user info
                        BX24.callMethod("user.current", {}, function(result) {
                            if (result.error()) {
                                document.getElementById("bitrixStatus").className = "status error";
                                document.getElementById("bitrixStatus").textContent = "Bitrix24 connection failed: " + result.error().getDescription();
                                log("Bitrix24 connection failed: " + result.error().getDescription());
                            } else {
                                const userData = result.data();
                                document.getElementById("bitrixStatus").className = "status success";
                                document.getElementById("bitrixStatus").textContent = "Connected to Bitrix24 as " + userData.NAME;
                                log("Connected to Bitrix24 as " + userData.NAME);
                                
                                // Get domain and access token automatically
                                BX24.callMethod("app.info", {}, function(appResult) {
                                    if (!appResult.error()) {
                                        const appData = appResult.data();
                                        const domain = "${domain}" || appData.DOMAIN || window.location.hostname;
                                        
                                        // For installations, we use the installation auth
                                        const accessToken = "${authId}";
                                        
                                        log("Using installation credentials");
                                        log("Domain: " + domain);
                                        log("Auth ID: " + (accessToken ? accessToken.substring(0, 20) + "..." : "Not available"));
                                        
                                        // Connect with installation credentials
                                        if (accessToken && domain) {
                                            connectSocket(domain, accessToken);
                                        } else {
                                            // Fallback: try to get OAuth token
                                            BX24.getAuth(function(auth) {
                                                if (auth && auth.access_token) {
                                                    log("Using OAuth access token");
                                                    connectSocket(domain, auth.access_token);
                                                } else {
                                                    log("No access token available, requesting installation");
                                                    BX24.install(function() {
                                                        log("Installation requested from Bitrix24");
                                                    });
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    });
                    
                    function connectSocket(domain, accessToken) {
                        log("Connecting to WhatsApp service...");
                        socket = io({ 
                            transports: ["websocket"], 
                            reconnectionAttempts: 5, 
                            reconnectionDelay: 1000 
                        });
                        
                        socket.on("connect", function() {
                            log("Socket.IO connected");
                            socket.emit("initialize_whatsapp", { 
                                domain: domain, 
                                accessToken: accessToken,
                                connectorId: 'bitrix24_whatsapp',
                                installationMode: true
                            });
                            document.getElementById("step1").classList.remove("active");
                            document.getElementById("step2").classList.add("active");
                        });
                        
                        socket.on("connect_error", function(error) {
                            log("Socket.IO connection error: " + error.message);
                            document.getElementById("connectionStatus").className = "status error";
                            document.getElementById("connectionStatus").textContent = "Connection failed: " + error.message;
                        });
                        
                        socket.on("connection_confirmed", function(data) {
                            log(\`Socket connected: \${data.socketId}\`);
                        });
                        
                        socket.on("qr_code", function(data) {
                            if (!qrGenerated) {
                                log("QR code received, rendering...");
                                try {
                                    const qrCode = new QRious({
                                        element: document.getElementById("qrCode"),
                                        value: data.qr,
                                        size: 200,
                                        level: 'H'
                                    });
                                    document.getElementById("qrContainer").classList.remove("hidden");
                                    document.getElementById("qrStatus").classList.remove("hidden");
                                    qrGenerated = true;
                                    log("QR code rendered successfully");
                                } catch (error) {
                                    log("QR code rendering failed: " + error.message);
                                    document.getElementById("connectionStatus").className = "status error";
                                    document.getElementById("connectionStatus").textContent = "QR code rendering failed";
                                }
                            }
                        });
                        
                        socket.on("status_update", function(status) {
                            log("Status: " + status.message);
                            document.getElementById("qrStatus").textContent = status.message;
                            document.getElementById("connectionStatus").textContent = status.message;
                        });
                        
                        socket.on("whatsapp_connected", function(data) {
                            log("WhatsApp connected successfully!");
                            document.getElementById("step2").classList.remove("active");
                            document.getElementById("step3").classList.add("active");
                            document.getElementById("qrContainer").classList.add("hidden");
                            document.getElementById("qrStatus").classList.add("hidden");
                            document.getElementById("connectionStatus").className = "status success";
                            document.getElementById("connectionStatus").textContent = "✅ WhatsApp connected successfully!";
                            document.getElementById("connectionInfo").classList.remove("hidden");
                            document.getElementById("statusText").textContent = "Connected";
                            document.getElementById("connectedSince").textContent = new Date(data.timestamp).toLocaleString();
                            document.getElementById("disconnectBtn").classList.remove("hidden");
                            isConnected = true;
                        });
                        
                        socket.on("message_received", function(messageData) {
                            log("Message received: " + messageData.messageId);
                            document.getElementById("lastMessage").textContent = new Date(messageData.timestamp).toLocaleString();
                        });
                        
                        socket.on("error", function(error) {
                            log("Error [" + error.type + "]: " + error.message);
                            document.getElementById("connectionStatus").className = "status error";
                            document.getElementById("connectionStatus").textContent = "Error: " + error.message;
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

    // FIXED: Enhanced embedded HTML for direct Bitrix24 integration
    // Fixed getBitrix24EmbeddedHTML function with proper chat interface activation
function getBitrix24EmbeddedHTML(domain, accessToken) {
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
                }
                .container {
                    max-width: 100%;
                    margin: 0 auto;
                    background: white;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                .header {
                    background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                    color: white;
                    padding: 15px 20px;
                    text-align: center;
                    flex-shrink: 0;
                }
                .header h1 {
                    font-size: 1.5rem;
                    margin-bottom: 5px;
                }
                .setup-container {
                    padding: 20px;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .chat-container {
                    padding: 0;
                    flex: 1;
                    display: none;
                    flex-direction: column;
                }
                .chat-container.active {
                    display: flex;
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
                .step.completed {
                    border-color: #28a745;
                    background: #d4edda;
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
                .step.completed .step-number {
                    background: #28a745;
                }
                .step-title {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #333;
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
                    max-height: 120px;
                    overflow-y: auto;
                    margin: 10px 0;
                }
                
                /* Chat Interface Styles */
                .chat-header {
                    background: #075e54;
                    color: white;
                    padding: 15px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .chat-header h3 {
                    margin: 0;
                    font-size: 1.2rem;
                }
                .connection-status {
                    background: rgba(255,255,255,0.2);
                    padding: 5px 10px;
                    border-radius: 15px;
                    font-size: 0.8rem;
                }
                .messages-area {
                    flex: 1;
                    background: #e5ddd5;
                    background-image: 
                        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 1px, transparent 1px);
                    background-size: 20px 20px;
                    padding: 20px;
                    overflow-y: auto;
                    min-height: 400px;
                }
                .message {
                    max-width: 70%;
                    margin: 8px 0;
                    padding: 10px 15px;
                    border-radius: 18px;
                    word-wrap: break-word;
                    position: relative;
                }
                .message.received {
                    background: white;
                    margin-right: auto;
                    border-bottom-left-radius: 5px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .message.sent {
                    background: #dcf8c6;
                    margin-left: auto;
                    border-bottom-right-radius: 5px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .message-time {
                    font-size: 11px;
                    color: #666;
                    margin-top: 5px;
                    text-align: right;
                }
                .message-input-area {
                    background: #f0f2f5;
                    padding: 10px 20px;
                    border-top: 1px solid #ddd;
                }
                .message-input-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .contact-selector {
                    flex-shrink: 0;
                    width: 200px;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 20px;
                    font-size: 14px;
                    background: white;
                }
                .message-input {
                    flex: 1;
                    padding: 10px 15px;
                    border: 1px solid #ddd;
                    border-radius: 20px;
                    font-size: 14px;
                    background: white;
                    resize: none;
                    min-height: 40px;
                    max-height: 120px;
                }
                .send-btn {
                    background: #25D366;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 45px;
                    height: 45px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    flex-shrink: 0;
                }
                .send-btn:hover {
                    background: #128C7E;
                }
                .send-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                .placeholder-message {
                    text-align: center;
                    color: #666;
                    font-style: italic;
                    padding: 50px 20px;
                    background: rgba(255,255,255,0.5);
                    border-radius: 10px;
                    margin: 20px;
                }
                .disconnect-btn {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 15px;
                    cursor: pointer;
                    font-size: 0.8rem;
                }
                .disconnect-btn:hover {
                    background: #c82333;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱 WhatsApp Connector</h1>
                    <p>Connect your WhatsApp to Bitrix24 CRM</p>
                </div>
                
                <!-- Setup Container (shown during connection) -->
                <div class="setup-container" id="setupContainer">
                    <div class="debug-log" id="debugLog">
                        <div>🔧 Bitrix24 Embedded Mode - Ready</div>
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
                    </div>
                </div>
                
                <!-- Chat Container (shown after successful connection) -->
                <div class="chat-container" id="chatContainer">
                    <div class="chat-header">
                        <h3>💬 WhatsApp Chat</h3>
                        <div class="connection-status" id="chatConnectionStatus">
                            Connected
                        </div>
                        <button class="disconnect-btn" id="disconnectBtn">Disconnect</button>
                    </div>
                    
                    <div class="messages-area" id="messagesArea">
                        <div class="placeholder-message" id="placeholderMessage">
                            🎉 WhatsApp connected successfully!<br>
                            Select a contact and start messaging.
                        </div>
                    </div>
                    
                    <div class="message-input-area">
                        <div class="message-input-row">
                            <input type="text" 
                                   class="contact-selector" 
                                   id="contactSelector"
                                   placeholder="Enter phone number (e.g., 1234567890)"
                                   disabled>
                            <textarea class="message-input" 
                                      id="messageInput"
                                      placeholder="Type your message..."
                                      disabled
                                      rows="1"></textarea>
                            <button class="send-btn" id="sendBtn" disabled>
                                ➤
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                let socket;
                let qrGenerated = false;
                let isConnected = false;
                let currentDomain = null;
                let currentAccessToken = null;
                const debugLog = document.getElementById("debugLog");
                
                // UI Elements
                const setupContainer = document.getElementById("setupContainer");
                const chatContainer = document.getElementById("chatContainer");
                const messagesArea = document.getElementById("messagesArea");
                const messageInput = document.getElementById("messageInput");
                const contactSelector = document.getElementById("contactSelector");
                const sendBtn = document.getElementById("sendBtn");
                const disconnectBtn = document.getElementById("disconnectBtn");
                const placeholderMessage = document.getElementById("placeholderMessage");
                
                function log(message) {
                    const logEntry = document.createElement("div");
                    logEntry.textContent = \`\${new Date().toLocaleTimeString()} - \${message}\`;
                    debugLog.appendChild(logEntry);
                    debugLog.scrollTop = debugLog.scrollHeight;
                }
                
                function showChatInterface() {
                    log("🎯 Switching to chat interface");
                    setupContainer.style.display = 'none';
                    chatContainer.classList.add('active');
                    
                    // Enable chat controls
                    contactSelector.disabled = false;
                    messageInput.disabled = false;
                    sendBtn.disabled = false;
                    
                    // Focus on contact selector for immediate use
                    setTimeout(() => {
                        contactSelector.focus();
                    }, 500);
                }
                
                function addMessage(text, sender, timestamp, phone = '') {
                    // Remove placeholder if this is the first message
                    if (placeholderMessage && placeholderMessage.parentNode) {
                        placeholderMessage.remove();
                    }
                    
                    const messageDiv = document.createElement("div");
                    messageDiv.className = \`message \${sender === 'user' ? 'sent' : 'received'}\`;
                    
                    let displayText = text;
                    if (sender === 'received' && phone) {
                        displayText = \`\${phone}: \${text}\`;
                    }
                    
                    messageDiv.innerHTML = \`
                        <div>\${displayText}</div>
                        <div class="message-time">
                            \${new Date(timestamp).toLocaleTimeString()}
                        </div>
                    \`;
                    
                    messagesArea.appendChild(messageDiv);
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }
                
                // Auto-resize textarea
                messageInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                });
                
                // Send message on Enter (but allow Shift+Enter for new lines)
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
                
                // Send message function
                function sendMessage() {
                    const message = messageInput.value.trim();
                    const contact = contactSelector.value.trim();
                    
                    if (!message || !contact) {
                        alert('Please enter both a phone number and message');
                        return;
                    }
                    
                    if (!socket || !isConnected) {
                        alert('WhatsApp is not connected');
                        return;
                    }
                    
                    // Format phone number
                    let chatId = contact;
                    if (!chatId.includes('@')) {
                        // Clean phone number and add WhatsApp format
                        chatId = chatId.replace(/[^0-9]/g, '');
                        chatId = \`\${chatId}@s.whatsapp.net\`;
                    }
                    
                    socket.emit("send_message", {
                        chatId: chatId,
                        message: message
                    });
                    
                    // Add message to UI immediately
                    addMessage(message, 'user', new Date().toISOString());
                    
                    // Clear input
                    messageInput.value = '';
                    messageInput.style.height = 'auto';
                }
                
                sendBtn.addEventListener('click', sendMessage);
                
                disconnectBtn.addEventListener('click', function() {
                    if (socket && isConnected) {
                        socket.emit("disconnect_whatsapp");
                        log("🔌 Disconnecting WhatsApp");
                    }
                });
                
                // Initialize Bitrix24 connection
                BX24.init(function() {
                    log("🔗 Bitrix24 API initialized");
                    
                    BX24.callMethod("user.current", {}, function(result) {
                        if (result.error()) {
                            document.getElementById("bitrixStatus").className = "status error";
                            document.getElementById("bitrixStatus").textContent = "Bitrix24 connection failed";
                            log("❌ Bitrix24 connection failed: " + result.error().getDescription());
                        } else {
                            const userData = result.data();
                            document.getElementById("bitrixStatus").className = "status success";
                            document.getElementById("bitrixStatus").textContent = "✅ Connected to Bitrix24 as " + userData.NAME;
                            log("✅ Connected to Bitrix24 as " + userData.NAME);
                            
                            // Mark step 1 as completed and move to step 2
                            document.getElementById("step1").classList.remove("active");
                            document.getElementById("step1").classList.add("completed");
                            document.getElementById("step2").classList.add("active");
                            
                            // Get domain and access token
                            currentDomain = "${domain}" || BX24.getDomain();
                            currentAccessToken = "${accessToken}";
                            
                            if (!currentAccessToken) {
                                BX24.getAuth(function(auth) {
                                    if (auth && auth.access_token) {
                                        currentAccessToken = auth.access_token;
                                        log("🔑 Using OAuth access token");
                                        connectSocket(currentDomain, currentAccessToken);
                                    } else {
                                        log("❌ No access token available");
                                        document.getElementById("bitrixStatus").className = "status error";
                                        document.getElementById("bitrixStatus").textContent = "No access token available";
                                    }
                                });
                            } else {
                                connectSocket(currentDomain, currentAccessToken);
                            }
                        }
                    });
                });
                
                function connectSocket(domain, accessToken) {
                    log("🔌 Connecting to WhatsApp service...");
                    socket = io({ 
                        transports: ["websocket"], 
                        reconnectionAttempts: 5, 
                        reconnectionDelay: 1000 
                    });
                    
                    socket.on("connect", function() {
                        log("✅ Socket.IO connected");
                        socket.emit("initialize_whatsapp", { 
                            domain: domain, 
                            accessToken: accessToken,
                            connectorId: 'bitrix24_whatsapp'
                        });
                    });
                    
                    socket.on("connect_error", function(error) {
                        log("❌ Socket.IO connection error: " + error.message);
                        document.getElementById("connectionStatus").className = "status error";
                        document.getElementById("connectionStatus").textContent = "Connection failed: " + error.message;
                    });
                    
                    socket.on("connection_confirmed", function(data) {
                        log(\`✅ Socket connected: \${data.socketId}\`);
                    });
                    
                    socket.on("qr_code", function(data) {
                        if (!qrGenerated) {
                            log("📱 Generating QR code");
                            try {
                                const qrCode = new QRious({
                                    element: document.getElementById("qrCode"),
                                    value: data.qr,
                                    size: 200,
                                    level: 'H'
                                });
                                document.getElementById("qrContainer").classList.remove("hidden");
                                document.getElementById("qrStatus").classList.remove("hidden");
                                document.getElementById("qrStatus").textContent = "📱 Scan QR code with WhatsApp";
                                qrGenerated = true;
                                log("✅ QR code displayed");
                            } catch (error) {
                                log("❌ QR code rendering failed: " + error.message);
                            }
                        }
                    });
                    
                    socket.on("status_update", function(status) {
                        log("📊 Status: " + status.message);
                        document.getElementById("qrStatus").textContent = status.message;
                        document.getElementById("connectionStatus").textContent = status.message;
                    });
                    
                    socket.on("whatsapp_connected", function(data) {
                        log("🎉 WhatsApp connected successfully!");
                        
                        // Update UI to show successful connection
                        document.getElementById("step2").classList.remove("active");
                        document.getElementById("step2").classList.add("completed");
                        document.getElementById("step3").classList.add("completed");
                        
                        document.getElementById("connectionStatus").className = "status success";
                        document.getElementById("connectionStatus").textContent = "✅ WhatsApp connected successfully!";
                        
                        // Hide QR code
                        document.getElementById("qrContainer").classList.add("hidden");
                        document.getElementById("qrStatus").classList.add("hidden");
                        
                        isConnected = true;
                        
                        // CRITICAL: Switch to chat interface after successful connection
                        setTimeout(() => {
                            showChatInterface();
                        }, 1500); // Small delay to let user see the success message
                    });
                    
                    socket.on("message_received", function(messageData) {
                        log("📨 Message received: " + messageData.messageId);
                        
                        // Extract phone number from WhatsApp ID
                        const phone = messageData.from ? messageData.from.split('@')[0] : 'Unknown';
                        
                        // Add message to chat interface
                        addMessage(
                            messageData.text || messageData.body || "📎 Media message", 
                            'received', 
                            messageData.timestamp || new Date().toISOString(),
                            phone
                        );
                        
                        // Auto-populate contact selector with sender's number
                        if (!contactSelector.value && phone !== 'Unknown') {
                            contactSelector.value = phone;
                        }
                        
                        // Create contact in Bitrix24 if new number
                        if (messageData.from && messageData.from.includes('@')) {
                            createOrUpdateBitrixContact(phone, messageData.text);
                        }
                    });
                    
                    socket.on("message_sent", function(data) {
                        log("✅ Message sent successfully");
                    });
                    
                    socket.on("error", function(error) {
                        log("❌ Error [" + error.type + "]: " + error.message);
                        document.getElementById("connectionStatus").className = "status error";
                        document.getElementById("connectionStatus").textContent = "Error: " + error.message;
                    });
                    
                    socket.on("disconnect", function() {
                        log("🔌 Socket.IO disconnected");
                        isConnected = false;
                        qrGenerated = false;
                        
                        // Switch back to setup interface
                        setupContainer.style.display = 'flex';
                        chatContainer.classList.remove('active');
                        
                        // Reset UI
                        document.getElementById("connectionStatus").className = "status error";
                        document.getElementById("connectionStatus").textContent = "Disconnected";
                        contactSelector.disabled = true;
                        messageInput.disabled = true;
                        sendBtn.disabled = true;
                        
                        // Reset steps
                        document.getElementById("step1").classList.add("active");
                        document.getElementById("step1").classList.remove("completed");
                        document.getElementById("step2").classList.remove("active", "completed");
                        document.getElementById("step3").classList.remove("active", "completed");
                    });
                }
                
                function createOrUpdateBitrixContact(phoneNumber, message) {
                    if (!BX24) return;
                    
                    // Search for existing contact
                    BX24.callMethod("crm.contact.list", {
                        filter: { "PHONE": phoneNumber },
                        select: ["ID", "NAME", "PHONE"]
                    }, function(result) {
                        if (result.error()) {
                            log("❌ Error searching contacts: " + result.error().getDescription());
                            return;
                        }
                        
                        const contacts = result.data();
                        if (contacts.length > 0) {
                            // Contact exists, add activity
                            const contactId = contacts[0].ID;
                            addBitrixActivity(contactId, message, phoneNumber);
                        } else {
                            // Create new contact
                            BX24.callMethod("crm.contact.add", {
                                fields: {
                                    "NAME": \`WhatsApp Contact +\${phoneNumber}\`,
                                    "PHONE": [{ "VALUE": phoneNumber, "VALUE_TYPE": "MOBILE" }],
                                    "SOURCE_ID": "WEB",
                                    "SOURCE_DESCRIPTION": "WhatsApp Connector"
                                }
                            }, function(addResult) {
                                if (addResult.error()) {
                                    log("❌ Error creating contact: " + addResult.error().getDescription());
                                } else {
                                    const contactId = addResult.data();
                                    log("✅ Created new contact: " + contactId);
                                    addBitrixActivity(contactId, message, phoneNumber);
                                }
                            });
                        }
                    });
                }
                
                function addBitrixActivity(contactId, message, phoneNumber) {
                    if (!BX24) return;
                    
                    BX24.callMethod("crm.activity.add", {
                        fields: {
                            "OWNER_TYPE_ID": 3, // Contact
                            "OWNER_ID": contactId,
                            "TYPE_ID": 1, // Call
                            "SUBJECT": "WhatsApp Message",
                            "DESCRIPTION": message,
                            "DIRECTION": 2, // Incoming
                            "COMMUNICATIONS": [{
                                "VALUE": phoneNumber,
                                "ENTITY_TYPE_ID": 3
                            }]
                        }
                    }, function(result) {
                        if (result.error()) {
                            log("❌ Error adding activity: " + result.error().getDescription());
                        } else {
                            log("✅ Added activity for contact " + contactId);
                        }
                    });
                }
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

    function getOAuthErrorHTML(error, description) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Error - WhatsApp Connector</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 600px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: #f8f9fa;
                    }
                    .error-container {
                        background: #f8d7da;
                        border: 1px solid #f5c6cb;
                        color: #721c24;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .btn {
                        display: inline-block;
                        padding: 12px 24px;
                        background: #25D366;
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 600;
                        margin: 10px 5px;
                    }
                    .btn:hover { background: #128C7E; }
                    .details { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <h2>❌ Authorization Error</h2>
                <div class="error-container">
                    <h3>OAuth Error: ${error}</h3>
                    <p>${description || 'An error occurred during authorization'}</p>
                </div>
                <div class="details">
                    <h4>What happened?</h4>
                    <p>There was an error during the Bitrix24 authorization process. This could be due to:</p>
                    <ul>
                        <li>User cancelled the authorization</li>
                        <li>Invalid app configuration</li>
                        <li>Network connectivity issues</li>
                        <li>Bitrix24 server issues</li>
                    </ul>
                </div>
                <a href="/" class="btn">🔄 Try Again</a>
                <a href="/debug/config" class="btn">🔧 Debug Info</a>
            </body>
            </html>
        `;
    }

    function getTokenExchangeErrorHTML(error) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Token Exchange Error - WhatsApp Connector</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 600px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: #f8f9fa;
                    }
                    .error-container {
                        background: #f8d7da;
                        border: 1px solid #f5c6cb;
                        color: #721c24;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .btn {
                        display: inline-block;
                        padding: 12px 24px;
                        background: #25D366;
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 600;
                        margin: 10px 5px;
                    }
                    .btn:hover { background: #128C7E; }
                    .technical-details { 
                        background: #f8f9fa; 
                        padding: 15px; 
                        border-radius: 6px; 
                        margin: 15px 0;
                        font-family: monospace;
                        font-size: 12px;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <h2>❌ Token Exchange Failed</h2>
                <div class="error-container">
                    <h3>Failed to exchange authorization code for access token</h3>
                    <p>The OAuth token exchange process failed. This usually indicates a configuration issue.</p>
                </div>
                <div class="technical-details">
                    <strong>Error Details:</strong><br>
                    ${error.message}<br>
                    ${error.response ? `Status: ${error.response.status}` : ''}
                </div>
                <p><strong>Possible solutions:</strong></p>
                <ul>
                    <li>Check that your APP_ID and APP_SECRET are correctly configured</li>
                    <li>Verify that the redirect URI matches exactly</li>
                    <li>Ensure the Bitrix24 domain is accessible</li>
                    <li>Try the installation process again</li>
                </ul>
                <a href="/" class="btn">🔄 Try Again</a>
                <a href="/debug/config" class="btn">🔧 Debug Configuration</a>
            </body>
            </html>
        `;
    }

    function getDomainErrorHTML(message) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Domain Error - WhatsApp Connector</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 500px; 
                        margin: 100px auto; 
                        padding: 20px;
                        background: #f8f9fa;
                    }
                    .error-container {
                        background: #fff3cd;
                        border: 1px solid #ffeaa7;
                        color: #856404;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .form-container { 
                        background: white; 
                        padding: 30px; 
                        border-radius: 10px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                    }
                    input { 
                        width: 100%; 
                        padding: 12px; 
                        margin: 10px 0; 
                        border: 2px solid #ddd; 
                        border-radius: 5px; 
                        font-size: 16px; 
                        box-sizing: border-box;
                    }
                    input:focus { outline: none; border-color: #25D366; }
                    .btn { 
                        background: #25D366; 
                        color: white; 
                        padding: 12px 24px; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        font-size: 16px; 
                        width: 100%; 
                        font-weight: 600;
                    }
                    .btn:hover { background: #128C7E; }
                    .help { 
                        background: #e3f2fd; 
                        padding: 15px; 
                        border-radius: 5px; 
                        margin: 15px 0; 
                    }
                </style>
            </head>
            <body>
                <div class="form-container">
                    <h2>📱 WhatsApp Connector</h2>
                    <div class="error-container">
                        ⚠️ ${message}
                    </div>
                    <p>Please enter a valid Bitrix24 domain:</p>
                    <form method="POST" action="/install.js">
                        <input type="text" 
                               name="domain" 
                               placeholder="yourcompany.bitrix24.com" 
                               pattern="[a-zA-Z0-9.-]+\\.bitrix24\\.(com|net|ru|de|fr|es|it|pl|ua|kz|by)"
                               required>
                        <button type="submit" class="btn">Continue Installation</button>
                    </form>
                    <div class="help">
                        <strong>💡 Domain Format Examples:</strong><br>
                        • mycompany.bitrix24.com<br>
                        • test123.bitrix24.net<br>
                        • company.bitrix24.ru
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    function getInstallationRedirectHTML(domain, authUrl) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Installing WhatsApp Connector</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                        background: rgba(255,255,255,0.95);
                        padding: 40px;
                        border-radius: 20px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        backdrop-filter: blur(10px);
                    }
                    .header h2 {
                        color: #25D366;
                        margin-bottom: 10px;
                        font-size: 1.8rem;
                    }
                    .spinner { 
                        border: 4px solid #f3f3f3; 
                        border-top: 4px solid #25D366; 
                        border-radius: 50%; 
                        width: 50px; 
                        height: 50px; 
                        animation: spin 1s linear infinite; 
                        margin: 30px auto; 
                    }
                    @keyframes spin { 
                        0% { transform: rotate(0deg); } 
                        100% { transform: rotate(360deg); } 
                    }
                    .info {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                        border-left: 4px solid #25D366;
                    }
                    .progress-steps {
                        margin: 30px 0;
                    }
                    .step {
                        display: flex;
                        align-items: center;
                        margin: 10px 0;
                        opacity: 0.5;
                    }
                    .step.active {
                        opacity: 1;
                        font-weight: 600;
                        color: #25D366;
                    }
                    .step-number {
                        width: 25px;
                        height: 25px;
                        border-radius: 50%;
                        background: #ddd;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-right: 15px;
                        font-size: 12px;
                        font-weight: bold;
                    }
                    .step.active .step-number {
                        background: #25D366;
                        color: white;
                    }
                    .manual-link {
                        margin-top: 30px;
                        padding: 15px;
                        background: #e3f2fd;
                        border-radius: 10px;
                    }
                    .manual-link a {
                        color: #1976D2;
                        text-decoration: none;
                        font-weight: 600;
                    }
                    .manual-link a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>📱 Installing WhatsApp Connector</h2>
                        <div class="spinner"></div>
                    </div>
                    
                    <div class="progress-steps">
                        <div class="step active">
                            <div class="step-number">1</div>
                            <span>Preparing installation...</span>
                        </div>
                        <div class="step" id="step2">
                            <div class="step-number">2</div>
                            <span>Redirecting to Bitrix24...</span>
                        </div>
                        <div class="step" id="step3">
                            <div class="step-number">3</div>
                            <span>Authorization required</span>
                        </div>
                        <div class="step" id="step4">
                            <div class="step-number">4</div>
                            <span>Installation complete</span>
                        </div>
                    </div>
                    
                    <div class="info">
                        <strong>Domain:</strong> ${domain}<br>
                        <strong>Status:</strong> <span id="status">Preparing...</span>
                    </div>
                    
                    <div class="manual-link">
                        <strong>Not redirected automatically?</strong><br>
                        <a href="${authUrl}" target="_blank">Click here to continue manually</a>
                    </div>
                </div>
                
                <script>
                    let currentStep = 1;
                    const statusElement = document.getElementById('status');
                    
                    function updateStep(stepNumber, status) {
                        // Remove active from all steps
                        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
                        
                        // Add active to current step
                        if (stepNumber <= 4) {
                            const steps = document.querySelectorAll('.step');
                            if (steps[stepNumber - 1]) {
                                steps[stepNumber - 1].classList.add('active');
                            }
                        }
                        
                        statusElement.textContent = status;
                        currentStep = stepNumber;
                    }
                    
                    setTimeout(() => {
                        updateStep(2, 'Redirecting to Bitrix24...');
                    }, 1000);
                    
                    setTimeout(() => {
                        updateStep(3, 'Please authorize the application...');
                        console.log('🚀 Redirecting to OAuth authorization:', '${authUrl}');
                        window.location.href = '${authUrl}';
                    }, 2500);
                    
                    // Fallback redirect
                    setTimeout(() => {
                        if (currentStep === 3) {
                            console.log('🔄 Fallback redirect triggered');
                            window.location.href = '${authUrl}';
                        }
                    }, 5000);
                </script>
            </body>
            </html>
        `;
    }

    // Function for Bitrix24 installation form when domain is needed
    function getBitrix24InstallationFormHTML(authId, memberId) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Connector - Installation</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                    .form { background: #f8f9fa; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    input { width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
                    button { background: #25D366; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%; }
                    button:hover { background: #128C7E; }
                    .help { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .info { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; color: #856404; }
                </style>
            </head>
            <body>
                <div class="form">
                    <h2>📱 WhatsApp Connector Installation</h2>
                    <div class="info">
                        <strong>✅ Bitrix24 Installation Detected</strong><br>
                        Auth ID: ${authId ? authId.substring(0, 20) + '...' : 'Not available'}<br>
                        Member ID: ${memberId || 'Not available'}
                    </div>
                    <p>Please enter your Bitrix24 domain to continue:</p>
                    <form method="POST" action="/install.js">
                        <input type="hidden" name="authId" value="${authId || ''}">
                        <input type="hidden" name="memberId" value="${memberId || ''}">
                        <input type="text" 
                               name="domain" 
                               placeholder="yourcompany.bitrix24.com" 
                               pattern="[a-zA-Z0-9.-]+\\.bitrix24\\.(com|net|ru|de|fr|es|it|pl|ua|kz|by)"
                               required>
                        <button type="submit">Continue Installation</button>
                    </form>
                    <div class="help">
                        <strong>💡 How to find your domain:</strong><br>
                        Look at your Bitrix24 URL. If it's <code>https://mycompany.bitrix24.com</code>,
                        then enter <code>mycompany.bitrix24.com</code>
                    </div>
                </div>
                <script>
                    // Auto-detect domain from referrer if possible
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
