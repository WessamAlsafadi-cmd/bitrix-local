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
        console.log('🪝 Webhook received from Bitrix24');
        console.log('📋 Webhook body:', JSON.stringify(req.body, null, 2));
        
        const { event, data, auth } = req.body;
        
        if (!event || !data) {
            console.log('⚠️ Invalid webhook format');
            return res.json({ success: false, error: 'Invalid webhook format' });
        }
        
        // Handle different event types
        switch (event.toUpperCase()) {
            case 'ONIMMESSAGEADD':
                // Message sent from Bitrix24 chat
                await handleBitrix24OutgoingMessage(data, auth);
                break;
                
            case 'ONCRMLEADADD':
                // New lead created in CRM
                await handleNewLead(data, auth);
                break;
                
            case 'ONCRMCONTACTADD':
                // New contact created in CRM
                await handleNewContact(data, auth);
                break;
                
            case 'ONCRMACTIVITYADD':
                // New activity in CRM (could be a message)
                await handleCRMActivity(data, auth);
                break;
                
            default:
                console.log('🔄 Unhandled event type:', event);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
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
        // Add this modified socket handler to your install.js file
// Replace the existing 'initialize_whatsapp' socket handler with this:

// Replace the socket 'initialize_whatsapp' handler in install.js with this:

socket.on('initialize_whatsapp', async function(data) {
    try {
        console.log('🔄 WhatsApp initialization request from:', socket.id);
        console.log('📋 Initialization data:', {
            domain: data.domain,
            hasAccessToken: !!data.accessToken,
            connectorId: data.connectorId,
            installationMode: data.installationMode,
            timestamp: new Date().toISOString()
        });
        
        // Validate required parameters
        if (!data.domain) {
            console.error('❌ Missing domain for socket:', socket.id);
            socket.emit('error', {
                type: 'missing_params',
                message: 'Missing domain',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        // Use domain-based auth directory for session persistence
        const sanitizedDomain = data.domain.replace(/[^a-z0-9]/gi, '_');
        const persistentAuthDir = `./auth_${sanitizedDomain}`;
        
        console.log('🔍 Using persistent auth directory:', persistentAuthDir);
        
        // Check if we already have a handler for this domain
        let existingHandler = null;
        for (const [sid, handler] of whatsappHandlers) {
            if (handler.config.bitrix24Domain === data.domain && handler.isConnected) {
                existingHandler = handler;
                console.log('♻️ Found existing connected handler for domain');
                break;
            }
        }
        
        if (existingHandler) {
            // Reuse existing connected handler
            whatsappHandlers.set(socket.id, existingHandler);
            setupHandlerEventListeners(socket, existingHandler);
            
            // Emit connected status immediately
            socket.emit('whatsapp_connected', {
                timestamp: new Date().toISOString(),
                message: 'WhatsApp already connected!'
            });
            
            socket.emit('status_update', {
                type: 'info',
                message: 'Using existing WhatsApp connection',
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
            refreshToken: data.refreshToken,
            connectedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            status: 'initializing'
        });
        
        console.log('🏗️ Creating WhatsApp handler for socket:', socket.id);
        
        // Create new WhatsApp handler with persistent auth directory
        const whatsappHandler = new WhatsAppBitrix24Handler({
            bitrix24Domain: data.domain,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            connectorId: data.connectorId || 'custom_whatsapp',
            authDir: persistentAuthDir, // Use domain-based directory
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
        
        // Check if session exists
        const fs = require('fs');
        let hasExistingSession = false;
        
        if (fs.existsSync(persistentAuthDir)) {
            const sessionFiles = fs.readdirSync(persistentAuthDir);
            hasExistingSession = sessionFiles.length > 0;
            
            if (hasExistingSession) {
                console.log('📱 Found existing WhatsApp session, attempting to restore...');
                socket.emit('status_update', {
                    type: 'info',
                    message: 'Restoring previous WhatsApp session...',
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        if (!hasExistingSession) {
            socket.emit('status_update', {
                type: 'info',
                message: 'Initializing new WhatsApp connection...',
                timestamp: new Date().toISOString()
            });
        }
        
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
            // Initialize WhatsApp (will use existing session if available)
            await whatsappHandler.initWhatsApp();
            clearTimeout(initTimeout);
            console.log('✅ WhatsApp handler initialized successfully');
            
            // If already connected (restored session), emit connected event
            if (whatsappHandler.isConnected) {
                socket.emit('whatsapp_connected', {
                    timestamp: new Date().toISOString(),
                    message: 'WhatsApp session restored successfully!'
                });
            }
            
        } catch (initError) {
            clearTimeout(initTimeout);
            console.error('❌ WhatsApp init error:', initError.message);
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
});        // Enhanced message sending with validation
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
        
        // Get handler but DON'T disconnect WhatsApp if it's connected
        const handler = whatsappHandlers.get(socketId);
        if (handler) {
            // Only remove the handler reference, don't disconnect WhatsApp
            // This preserves the session for reconnection
            if (!handler.isConnected) {
                // Only cleanup if not connected
                console.log('🔌 Cleaning up disconnected handler for socket:', socketId);
                await handler.cleanup();
            } else {
                console.log('📱 Keeping WhatsApp session alive for socket:', socketId);
            }
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
        const refreshToken = req.query.refresh_token;
        
        // Always serve the embedded interface - NO REDIRECTS
        res.send(getBitrix24EmbeddedHTML(domain, accessToken, refreshToken));
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
        const refreshToken = req.query.refresh_token;
        
        // Check if this is coming from Bitrix24
        const isBitrix24Request = req.headers.referer && req.headers.referer.includes('bitrix24');
        
        if (isBitrix24Request || (domain && accessToken)) {
            console.log('🎯 Bitrix24 request detected, serving embedded interface');
            res.send(getBitrix24EmbeddedHTML(domain, accessToken, refreshToken));
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
            res.send(getBitrix24EmbeddedHTML(null, null, null));
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

    // MODIFIED: OAuth callback to store refresh token
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
            const expiresIn = tokenResponse.data.expires_in;
            
            if (!accessToken) {
                throw new Error('No access token received from Bitrix24');
            }
            
            // Store tokens securely (in production, use a database)
            const tokenData = {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: Date.now() + (expiresIn * 1000),
                domain: domain
            };
            
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
            
            // Redirect to app with credentials including refresh token
            const appUrl = `/app?domain=${encodeURIComponent(domain)}&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
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
    // FIXED: getBitrix24AppInstallationHTML function with proper token handling
function getBitrix24AppInstallationHTML(domain, authId, memberId, placement) {
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
                .chat-interface {
                    display: none;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    margin-top: 20px;
                }
                .chat-interface.active {
                    display: block;
                }
                .messages-container {
                    height: 300px;
                    overflow-y: auto;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .message {
                    margin-bottom: 10px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    max-width: 70%;
                }
                .message.sent {
                    background: #25D366;
                    color: white;
                    margin-left: auto;
                    text-align: right;
                }
                .message.received {
                    background: #e9ecef;
                    color: #333;
                }
                .message-input-container {
                    display: flex;
                    gap: 10px;
                }
                .message-input {
                    flex: 1;
                    padding: 10px;
                    border: 2px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }
                .message-input:focus {
                    outline: none;
                    border-color: #25D366;
                }
                .send-btn {
                    padding: 10px 20px;
                    background: #25D366;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                }
                .send-btn:hover {
                    background: #128C7E;
                }
                .send-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱 WhatsApp Connector</h1>
                    <p>Connect WhatsApp to Bitrix24 CRM</p>
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
                            <div class="step-title">Scan QR Code with WhatsApp</div>
                        </div>
                        <div class="qr-container hidden" id="qrContainer">
                            <canvas id="qrCode" class="qr-code"></canvas>
                            <p>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                            <p>Then scan this QR code</p>
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
                                <h4>Messages</h4>
                                <p id="messageCount">0</p>
                            </div>
                        </div>
                        <button class="btn btn-danger hidden" id="disconnectBtn">Disconnect WhatsApp</button>
                    </div>
                    
                    <!-- Chat Interface (shown after connection) -->
                    <div class="chat-interface" id="chatInterface">
                        <h3>💬 Test WhatsApp Messaging</h3>
                        <div class="messages-container" id="messagesContainer">
                            <div style="text-align: center; color: #999;">No messages yet</div>
                        </div>
                        <div class="message-input-container">
                            <input 
                                type="text" 
                                class="message-input" 
                                id="phoneNumber" 
                                placeholder="Phone number (e.g., 1234567890)"
                            />
                            <input 
                                type="text" 
                                class="message-input" 
                                id="messageInput" 
                                placeholder="Type your message..."
                            />
                            <button class="send-btn" id="sendMessageBtn" disabled>Send</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                let socket;
                let qrGenerated = false;
                let isConnected = false;
                let currentDomain = "${domain}";
                let currentAccessToken = "${authId}";
                let messageCount = 0;
                
                const debugLog = document.getElementById("debugLog");
                
                function log(message) {
                    const logEntry = document.createElement("div");
                    const timestamp = new Date().toLocaleTimeString();
                    logEntry.textContent = timestamp + " - " + message;
                    debugLog.appendChild(logEntry);
                    debugLog.scrollTop = debugLog.scrollHeight;
                    console.log(timestamp, message);
                }
                
                function updateStep(stepNumber) {
                    // Remove active class from all steps
                    document.querySelectorAll('.step').forEach(step => {
                        step.classList.remove('active');
                    });
                    // Add active class to current step
                    document.getElementById('step' + stepNumber).classList.add('active');
                }
                
                function showChatInterface() {
                    document.getElementById('chatInterface').classList.add('active');
                    document.getElementById('sendMessageBtn').disabled = false;
                }
                
                function addMessageToChat(message, type) {
                    const container = document.getElementById('messagesContainer');
                    if (container.querySelector('div[style*="text-align: center"]')) {
                        container.innerHTML = '';
                    }
                    
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message ' + type;
                    msgDiv.textContent = message;
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;
                    
                    // Update message count
                    messageCount++;
                    document.getElementById('messageCount').textContent = messageCount;
                }
                
                // Initialize Bitrix24 SDK
                BX24.init(function() {
                    log("Bitrix24 SDK initialized");
                    
                    // Get current user info to verify connection
                    BX24.callMethod("user.current", {}, function(result) {
                        if (result.error()) {
                            log("ERROR: " + result.error().getDescription());
                            document.getElementById("bitrixStatus").className = "status error";
                            document.getElementById("bitrixStatus").textContent = "Failed to connect to Bitrix24";
                        } else {
                            const userData = result.data();
                            log("Connected as: " + userData.NAME + " " + userData.LAST_NAME);
                            document.getElementById("bitrixStatus").className = "status success";
                            document.getElementById("bitrixStatus").textContent = "Connected as " + userData.NAME;
                            
                            // Now connect to WhatsApp backend
                            connectToWhatsApp();
                        }
                    });
                });
                
                function connectToWhatsApp() {
                    log("Connecting to WhatsApp backend...");
                    
                    // Connect to Socket.IO server
                    socket = io(window.location.origin, {
                        transports: ['websocket'],
                        reconnectionAttempts: 5,
                        reconnectionDelay: 1000
                    });
                    
                    socket.on('connect', function() {
                        log("Socket.IO connected: " + socket.id);
                        
                        // Initialize WhatsApp with the auth token
                        log("Sending WhatsApp initialization request...");
                        socket.emit('initialize_whatsapp', {
                            domain: currentDomain,
                            accessToken: currentAccessToken,
                            connectorId: 'bitrix24_whatsapp',
                            installationMode: true
                        });
                        
                        updateStep(2);
                    });
                    
                    socket.on('connect_error', function(error) {
                        log("Socket connection error: " + error.message);
                        document.getElementById("connectionStatus").className = "status error";
                        document.getElementById("connectionStatus").textContent = "Connection failed: " + error.message;
                    });
                    
                    socket.on('connection_confirmed', function(data) {
                        log("Connection confirmed: " + data.socketId);
                    });
                    
                    socket.on('qr_code', function(data) {
                        log("QR code received!");
                        if (!qrGenerated) {
                            try {
                                const qrCode = new QRious({
                                    element: document.getElementById("qrCode"),
                                    value: data.qr,
                                    size: 250,
                                    level: 'H'
                                });
                                document.getElementById("qrContainer").classList.remove("hidden");
                                document.getElementById("qrStatus").classList.remove("hidden");
                                qrGenerated = true;
                                log("QR code displayed - please scan with WhatsApp");
                            } catch (error) {
                                log("QR code rendering error: " + error.message);
                            }
                        }
                    });
                    
                    socket.on('status_update', function(data) {
                        log("Status: " + data.message);
                        document.getElementById("qrStatus").textContent = data.message;
                        document.getElementById("connectionStatus").textContent = data.message;
                    });
                    
                    socket.on('whatsapp_connected', function(data) {
                        log("WhatsApp connected successfully!");
                        isConnected = true;
                        qrGenerated = false;
                        
                        updateStep(3);
                        document.getElementById("qrContainer").classList.add("hidden");
                        document.getElementById("qrStatus").classList.add("hidden");
                        document.getElementById("connectionStatus").className = "status success";
                        document.getElementById("connectionStatus").textContent = "✅ WhatsApp connected successfully!";
                        document.getElementById("connectionInfo").classList.remove("hidden");
                        document.getElementById("statusText").textContent = "Connected";
                        document.getElementById("connectedSince").textContent = new Date().toLocaleString();
                        document.getElementById("disconnectBtn").classList.remove("hidden");
                        
                        showChatInterface();
                        
                        // Register webhook for incoming messages
                        registerWebhook();
                    });
                    
                    socket.on('message_received', function(data) {
                        log("Message received from: " + data.from);
                        addMessageToChat(data.text, 'received');
                        
                        // Send to Bitrix24 CRM
                        createLeadFromMessage(data);
                    });
                    
                    socket.on('error', function(error) {
                        log("Error: " + error.message);
                        
                        if (error.type === 'missing_params' || error.type === 'invalid_domain') {
                            // Try to refresh the token
                            BX24.getAuth(function(auth) {
                                if (auth && auth.access_token) {
                                    log("Got fresh token, retrying...");
                                    currentAccessToken = auth.access_token;
                                    socket.emit('initialize_whatsapp', {
                                        domain: currentDomain,
                                        accessToken: currentAccessToken,
                                        connectorId: 'bitrix24_whatsapp'
                                    });
                                }
                            });
                        } else {
                            document.getElementById("connectionStatus").className = "status error";
                            document.getElementById("connectionStatus").textContent = "Error: " + error.message;
                        }
                    });
                    
                    socket.on('disconnect', function() {
                        log("Socket disconnected");
                        isConnected = false;
                        document.getElementById("connectionStatus").className = "status error";
                        document.getElementById("connectionStatus").textContent = "Disconnected";
                        document.getElementById("sendMessageBtn").disabled = true;
                    });
                }
                
                function registerWebhook() {
                    log("Registering Bitrix24 webhook...");
                    BX24.callMethod(
                        "event.bind",
                        {
                            event: "ONIMCONNECTORLINEDELETE",
                            handler: window.location.origin + "/webhook"
                        },
                        function(result) {
                            if (result.error()) {
                                log("Webhook registration failed: " + result.error().getDescription());
                            } else {
                                log("Webhook registered successfully");
                            }
                        }
                    );
                }
                
                function createLeadFromMessage(messageData) {
                    log("Creating lead from WhatsApp message...");
                    
                    BX24.callMethod(
                        "crm.lead.add",
                        {
                            fields: {
                                TITLE: "WhatsApp Message from " + messageData.from,
                                SOURCE_ID: "OTHER",
                                SOURCE_DESCRIPTION: "WhatsApp",
                                COMMENTS: messageData.text,
                                PHONE: [{ VALUE: messageData.from.replace('@s.whatsapp.net', ''), VALUE_TYPE: "WORK" }]
                            }
                        },
                        function(result) {
                            if (result.error()) {
                                log("Lead creation failed: " + result.error().getDescription());
                            } else {
                                log("Lead created with ID: " + result.data());
                            }
                        }
                    );
                }
                
                // Disconnect button handler
                document.getElementById("disconnectBtn").addEventListener("click", function() {
                    if (socket && isConnected) {
                        socket.emit("disconnect_whatsapp");
                        log("Disconnecting WhatsApp...");
                        document.getElementById("connectionStatus").className = "status info";
                        document.getElementById("connectionStatus").textContent = "Disconnecting...";
                        updateStep(2);
                    }
                });
                
                // Send message handler
                document.getElementById("sendMessageBtn").addEventListener("click", function() {
                    const phone = document.getElementById("phoneNumber").value.trim();
                    const message = document.getElementById("messageInput").value.trim();
                    
                    if (phone && message && socket && isConnected) {
                        log("Sending message to " + phone);
                        socket.emit("send_message", {
                            chatId: phone,
                            message: message
                        });
                        
                        addMessageToChat(message, 'sent');
                        document.getElementById("messageInput").value = "";
                    }
                });
                
                // Enter key handler for message input
                document.getElementById("messageInput").addEventListener("keypress", function(e) {
                    if (e.key === "Enter") {
                        document.getElementById("sendMessageBtn").click();
                    }
                });
            </script>
        </body>
        </html>
    `;
}
    // MODIFIED: Enhanced embedded HTML with better chat interface visibility and token handling
    // MODIFIED: Enhanced embedded HTML with better chat interface visibility and token handling
function getBitrix24EmbeddedHTML(domain, accessToken, refreshToken) {
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
                * { margin: 0; padding: 0; box-sizing: border-box; }
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
                .header h1 { font-size: 1.5rem; margin-bottom: 5px; }
                .setup-container, .chat-container {
                    padding: 20px;
                    flex-grow: 1;
                }
                .chat-container {
                    display: none;
                }
                .chat-container.active {
                    display: flex;
                    flex-direction: column;
                }
                .step {
                    margin-bottom: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    border: 2px solid #f0f0f0;
                }
                .step.active {
                    border-color: #25D366;
                    background: #f8fff8;
                }
                .qr-container {
                    text-align: center;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .status {
                    padding: 10px;
                    border-radius: 6px;
                    margin: 10px 0;
                }
                .status.success { background: #d4edda; color: #155724; }
                .status.error { background: #f8d7da; color: #721c24; }
                .status.info { background: #d1ecf1; color: #0c5460; }
                .hidden { display: none; }
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
                .btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    cursor: pointer;
                    background: #25D366;
                    color: white;
                }
                .btn:hover { background: #128C7E; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱 WhatsApp Connector</h1>
                    <p>Connect your WhatsApp to Bitrix24 CRM</p>
                </div>
                
                <div class="setup-container" id="setupContainer">
                    <div class="debug-log" id="debugLog">
                        <div>🔧 Embedded Mode - Ready</div>
                    </div>
                    
                    <div class="step active" id="step1">
                        <h3>Step 1: Connecting to Bitrix24</h3>
                        <div id="bitrixStatus" class="status info">Initializing...</div>
                    </div>
                    
                    <div class="step" id="step2">
                        <h3>Step 2: Scan QR Code</h3>
                        <div class="qr-container hidden" id="qrContainer">
                            <canvas id="qrCode"></canvas>
                            <p>Scan this QR code with WhatsApp</p>
                        </div>
                    </div>
                    
                    <div class="step" id="step3">
                        <h3>Step 3: WhatsApp Connected</h3>
                        <div id="connectionStatus" class="status info">Not connected</div>
                        <button class="btn hidden" id="disconnectBtn">Disconnect WhatsApp</button>
                    </div>
                </div>
                
                <div class="chat-container" id="chatContainer">
                    <div id="chatInterface">
                        <h3>WhatsApp Chat Interface</h3>
                        <div id="messageArea"></div>
                        <input type="text" id="messageInput" placeholder="Type a message..." />
                        <button class="btn" id="sendBtn">Send</button>
                    </div>
                </div>
            </div>
            
            <script>
                let socket;
                let qrGenerated = false;
                let isConnected = false;
                let currentDomain = '${domain || ''}';
                let currentAccessToken = '${accessToken || ''}';
                let currentRefreshToken = '${refreshToken || ''}';
                const debugLog = document.getElementById("debugLog");
                const setupContainer = document.getElementById("setupContainer");
                const chatContainer = document.getElementById("chatContainer");
                
                function log(message) {
                    const logEntry = document.createElement("div");
                    logEntry.textContent = new Date().toLocaleTimeString() + " - " + message;
                    debugLog.appendChild(logEntry);
                    debugLog.scrollTop = debugLog.scrollHeight;
                }
                
                function showChatInterface() {
                    log("🎯 Switching to chat interface");
                    setupContainer.style.display = "none";
                    chatContainer.classList.add("active");
                }
                
                function initializeBitrix24() {
                    if (typeof BX24 !== 'undefined') {
                        BX24.init(function() {
                            log("Bitrix24 API initialized");
                            
                            // Get current user info
                            BX24.callMethod("user.current", {}, function(result) {
                                if (!result.error()) {
                                    const userData = result.data();
                                    document.getElementById("bitrixStatus").className = "status success";
                                    document.getElementById("bitrixStatus").textContent = "Connected as " + userData.NAME;
                                    log("Connected to Bitrix24 as " + userData.NAME);
                                    
                                    // Get auth info if not provided
                                    if (!currentAccessToken) {
                                        BX24.getAuth(function(auth) {
                                            if (auth && auth.access_token) {
                                                currentAccessToken = auth.access_token;
                                                currentDomain = auth.domain || currentDomain;
                                                connectSocket();
                                            }
                                        });
                                    } else {
                                        connectSocket();
                                    }
                                } else {
                                    document.getElementById("bitrixStatus").className = "status error";
                                    document.getElementById("bitrixStatus").textContent = "Bitrix24 connection failed";
                                    log("Bitrix24 connection failed: " + result.error().getDescription());
                                }
                            });
                        });
                    } else {
                        // Not in Bitrix24 context, try direct connection
                        if (currentAccessToken && currentDomain) {
                            log("Using provided credentials");
                            connectSocket();
                        } else {
                            document.getElementById("bitrixStatus").className = "status error";
                            document.getElementById("bitrixStatus").textContent = "No credentials available";
                        }
                    }
                }
                
                // Add this improved connectSocket function to your getBitrix24AppInstallationHTML
// This handles session restoration and message sending properly

function connectSocket(domain, accessToken) {
    log("Connecting to WhatsApp service...");
    currentDomain = domain;
    currentAccessToken = accessToken;
    
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
        log("Socket connected: " + data.socketId);
    });
    
    socket.on("qr_code", function(data) {
        if (!qrGenerated) {
            log("QR code received, rendering...");
            try {
                const qrCode = new QRious({
                    element: document.getElementById("qrCode"),
                    value: data.qr,
                    size: 250,
                    level: 'H'
                });
                document.getElementById("qrContainer").classList.remove("hidden");
                document.getElementById("qrStatus").classList.remove("hidden");
                qrGenerated = true;
                log("QR code displayed - please scan with WhatsApp");
            } catch (error) {
                log("QR code rendering failed: " + error.message);
            }
        }
    });
    
    socket.on("status_update", function(status) {
        log("Status: " + status.message);
        document.getElementById("qrStatus").textContent = status.message;
        document.getElementById("connectionStatus").textContent = status.message;
        
        // Check if session was restored
        if (status.message.includes("Restoring")) {
            document.getElementById("qrContainer").classList.add("hidden");
            document.getElementById("qrStatus").textContent = "Restoring session...";
        }
    });
    
    socket.on("whatsapp_connected", function(data) {
        log("WhatsApp connected successfully!");
        isConnected = true;
        qrGenerated = false;
        
        updateStep(3);
        document.getElementById("qrContainer").classList.add("hidden");
        document.getElementById("qrStatus").classList.add("hidden");
        document.getElementById("connectionStatus").className = "status success";
        document.getElementById("connectionStatus").textContent = "✅ WhatsApp connected successfully!";
        document.getElementById("connectionInfo").classList.remove("hidden");
        document.getElementById("statusText").textContent = "Connected";
        document.getElementById("connectedSince").textContent = new Date(data.timestamp).toLocaleString();
        document.getElementById("disconnectBtn").classList.remove("hidden");
        
        showChatInterface();
        
        // Register webhook for incoming messages
        registerWebhook();
    });
    
    socket.on("message_received", function(data) {
        log("Message received from: " + data.from);
        addMessageToChat(data.text + " (from: " + data.phoneNumber + ")", 'received');
        
        // Send to Bitrix24 CRM
        createLeadFromMessage(data);
    });
    
    socket.on("message_sent", function(data) {
        log("Message sent successfully to: " + data.chatId);
        // Show success feedback
        const statusDiv = document.createElement("div");
        statusDiv.className = "status success";
        statusDiv.textContent = "✅ Message sent successfully!";
        document.getElementById("chatInterface").appendChild(statusDiv);
        setTimeout(() => statusDiv.remove(), 3000);
    });
    
    socket.on("error", function(error) {
        log("Error [" + error.type + "]: " + error.message);
        
        if (error.message.includes("not registered on WhatsApp")) {
            alert("This phone number is not registered on WhatsApp. Please check the number and try again.");
        } else if (error.type === 'send_error') {
            alert("Failed to send message: " + error.message);
        } else {
            document.getElementById("connectionStatus").className = "status error";
            document.getElementById("connectionStatus").textContent = "Error: " + error.message;
        }
    });
    
    socket.on("disconnect", function() {
        log("Socket disconnected");
        isConnected = false;
        document.getElementById("connectionStatus").className = "status error";
        document.getElementById("connectionStatus").textContent = "Disconnected";
        document.getElementById("sendMessageBtn").disabled = true;
    });
}

// Improved send message handler with better phone number formatting
document.getElementById("sendMessageBtn").addEventListener("click", function() {
    let phone = document.getElementById("phoneNumber").value.trim();
    const message = document.getElementById("messageInput").value.trim();
    
    if (!phone || !message) {
        alert("Please enter both phone number and message");
        return;
    }
    
    if (!socket || !isConnected) {
        alert("WhatsApp is not connected. Please wait for connection.");
        return;
    }
    
    // Format phone number properly
    phone = phone.replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parentheses
    
    // Add country code if not present (default to UAE)
    if (!phone.startsWith('+')) {
        if (phone.startsWith('0')) {
            phone = phone.substring(1); // Remove leading 0
        }
        if (phone.startsWith('5') && phone.length === 9) {
            phone = '971' + phone; // UAE mobile
        } else if (!phone.startsWith('971')) {
            phone = '971' + phone; // Add UAE country code
        }
    }
    
    log("Sending message to " + phone);
    socket.emit("send_message", {
        chatId: phone,
        message: message
    });
    
    addMessageToChat(message + " (to: " + phone + ")", 'sent');
    document.getElementById("messageInput").value = "";
});                
                // Initialize on page load
                window.addEventListener("load", function() {
                    initializeBitrix24();
                });
            </script>
        </body>
        </html>
    `;
}

// Add these missing helper functions as well
function getBitrix24InstallationFormHTML(authId, memberId) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Complete Installation</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                .form { background: #f8f9fa; padding: 30px; border-radius: 10px; }
                input { width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 5px; }
                button { background: #25D366; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; width: 100%; }
            </style>
        </head>
        <body>
            <div class="form">
                <h2>📱 Complete WhatsApp Installation</h2>
                <p>Please enter your Bitrix24 domain:</p>
                <form method="POST" action="/install.js">
                    <input type="hidden" name="AUTH_ID" value="${authId}">
                    <input type="hidden" name="member_id" value="${memberId}">
                    <input type="text" name="domain" placeholder="yourcompany.bitrix24.com" required>
                    <button type="submit">Complete Installation</button>
                </form>
            </div>
        </body>
        </html>
    `;
}

function getDomainErrorHTML(message) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Installation Error</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                .error { background: #f8d7da; padding: 30px; border-radius: 10px; color: #721c24; }
                a { color: #25D366; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>❌ Installation Error</h2>
                <p>${message}</p>
                <p><a href="/install.js">← Try Again</a></p>
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
            <title>Redirecting to Bitrix24...</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; text-align: center; }
                .loading { background: #f8f9fa; padding: 30px; border-radius: 10px; }
            </style>
        </head>
        <body>
            <div class="loading">
                <h2>🔄 Redirecting to Bitrix24...</h2>
                <p>Connecting to ${domain}</p>
                <p>Please wait...</p>
            </div>
            <script>
                window.location.href = '${authUrl}';
            </script>
        </body>
        </html>
    `;
}

function getOAuthErrorHTML(error, description) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>OAuth Error</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                .error { background: #f8d7da; padding: 30px; border-radius: 10px; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>❌ OAuth Error</h2>
                <p><strong>Error:</strong> ${error}</p>
                <p><strong>Description:</strong> ${description || 'Unknown error occurred'}</p>
                <p><a href="/install.js">← Try Again</a></p>
            </div>
        </body>
        </html>
    `;
}

function getTokenExchangeErrorHTML(error) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Token Exchange Error</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                .error { background: #f8d7da; padding: 30px; border-radius: 10px; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>❌ Token Exchange Failed</h2>
                <p>${error.message}</p>
                <p><a href="/install.js">← Try Again</a></p>
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
                body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
                .error { background: #f8d7da; padding: 30px; border-radius: 10px; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>❌ Installation Error</h2>
                <p>Insufficient data for installation. Please ensure you're installing from Bitrix24.</p>
                <p><a href="/install.js">← Try Again</a></p>
            </div>
        </body>
        </html>
    `;
}

// Start the server
server.listen(PORT, function() {
    console.log('🚀 WhatsApp-Bitrix24 Connector running on port ' + PORT);
    console.log('📍 Base URL: ' + BASE_URL);
    console.log('🔑 App ID: ' + APP_ID);
    console.log('✅ Server is ready to accept connections!');
});

// Graceful shutdown
process.on('SIGTERM', async function() {
    console.log('📛 SIGTERM received, shutting down gracefully...');
    
    // Cleanup all handlers
    for (const [socketId, handler] of whatsappHandlers) {
        try {
            await handler.cleanup();
        } catch (error) {
            console.error('Error cleaning up handler:', error);
        }
    }
    
    server.close(function() {
        console.log('👋 Server closed');
        process.exit(0);
    });
});

} catch (error) {
    console.error('FATAL ERROR during startup:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
}
