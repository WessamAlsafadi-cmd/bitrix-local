// Add this log at the very top to see if the file starts executing at all.
console.log('Starting install.js...');

try {
    // #1: Load Dependencies
    console.log('Loading dependencies...');
    const express = require('express');
    const http = require('http');
    const { Server } = require("socket.io");
    const axios = require('axios');
    const querystring = require('querystring');
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
    const APP_SCOPE = 'imconnector,imopenlines,crm,placement,event';
    const BASE_URL = process.env.BASE_URL || `https://your-app.onrender.com`;
    console.log('SUCCESS: Configuration loaded.');

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
                whatsappHandler.on('qr', (qr) => socket.emit('qr_code', qr));
                whatsappHandler.on('status', (status) => socket.emit('status_update', status));
                whatsappHandler.on('connected', () => socket.emit('whatsapp_connected'));
                whatsappHandler.on('message_received', (messageData) => socket.emit('message_received', messageData));
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
                socket.emit('status_response', whatsappHandler.getConnectionStatus());
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
    app.get('/health', (req, res) =>
        res.json({ status: 'ok', timestamp: new Date().toISOString() })
    );

    app.get('/handler.js', (req, res) => res.send(getAppWidgetHTML()));
    app.get('/', (req, res) => res.send(getInstallationHTML(req)));

    app.get('/install.js', (req, res) => {
        const { DOMAIN } = req.query;
        if (!DOMAIN) {
            return res.status(400).send('<h2>Installation Error</h2><p>Missing DOMAIN parameter.</p>');
        }
        const authUrl = `https://${DOMAIN}/oauth/authorize/?` + querystring.stringify({
            client_id: APP_ID,
            response_type: 'code',
            scope: APP_SCOPE,
            redirect_uri: `${BASE_URL}/oauth/callback`
        });
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

            const tokenData = {
                grant_type: 'authorization_code',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                code: code,
            };

            const tokenResponse = await axios.post(`https://${domain}/oauth/token/`, querystring.stringify(tokenData));
            const { access_token } = tokenResponse.data;

            if (!access_token) throw new Error('Failed to obtain access token');

            const customApp = new CustomChannelApp(domain, access_token);
            const installResult = await customApp.install();

            res.send(getInstallResultHTML(installResult, access_token, domain));

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
        <head><title>Install Bitrix24 WhatsApp Connector</title></head>
        <body>
            <h2>Install the Bitrix24 WhatsApp Connector</h2>
            <p>Please initiate installation via your Bitrix24 portal.</p>
        </body>
        </html>`;
    }

    function getInstallResultHTML(installResult, accessToken, domain) {
        return `
        <!DOCTYPE html>
        <html>
        <head><title>Installation Result</title></head>
        <body>
            <h2>Installation Result</h2>
            <pre>${JSON.stringify({ installResult, accessToken, domain }, null, 2)}</pre>
        </body>
        </html>`;
    }

    // --- Start Server ---
    server.listen(PORT, () => {
        console.log(`✅✅✅ Application started successfully! ✅✅✅`);
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 Socket.IO enabled`);
        console.log(`🌐 Access at: ${BASE_URL}`);
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
