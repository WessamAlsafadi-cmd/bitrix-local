/**
 * Bitrix24 Custom WhatsApp Connector - Main Application Server
 */
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const WhatsAppBitrix24Handler = require('./handler.js');
const CustomChannelApp = require('./lib/customChannelApp'); // We will create this file next

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Configuration
const APP_ID = process.env.APP_ID || 'your_app_id_here';
const APP_SECRET = process.env.APP_SECRET || 'your_app_secret_here';
const APP_SCOPE = 'imconnector,imopenlines,crm';
const BASE_URL = process.env.BASE_URL || `https://bitrix-local.onrender.com`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 Starting Bitrix24 WhatsApp Connector Server...');

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
    console.log('🔌 A user connected to the dashboard');

    const handlerConfig = {
        bitrix24Domain: process.env.BITRIX24_DOMAIN,
        accessToken: process.env.BITRIX24_ACCESS_TOKEN
    };
    const whatsAppHandler = new WhatsAppBitrix24Handler(handlerConfig);

    whatsAppHandler.on('qr', (qr) => {
        console.log('Relaying QR to frontend...');
        socket.emit('qr', qr);
    });
    whatsAppHandler.on('status', (status) => socket.emit('statusUpdate', status));
    whatsAppHandler.on('connected', () => socket.emit('statusUpdate', 'Successfully Connected!'));

    socket.on('start-whatsapp', () => {
        console.log('Frontend requested WhatsApp start. Initializing...');
        if (handlerConfig.bitrix24Domain && handlerConfig.accessToken) {
            whatsAppHandler.initWhatsApp().catch(err => {
                console.error("Failed to init WhatsApp:", err);
                socket.emit('statusUpdate', 'Error: Could not start WhatsApp handler.');
            });
        } else {
            console.warn("Cannot start WhatsApp, Bitrix24 config is missing.");
            socket.emit('statusUpdate', 'Error: Bitrix24 domain or access token is not configured on the server. Please reinstall the app.');
        }
    });

    socket.on('disconnect', () => console.log('User disconnected'));
});

// --- Express Routes ---

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// The main application interface for Bitrix24 (this shows the QR code)
app.get('/app/widget', (req, res) => {
    res.send(getAppWidgetHTML());
});

// Main installation form (if accessed directly)
app.get('/', (req, res) => {
    res.send(getInstallationHTML(req));
});

// GET handler for Bitrix24 installation
app.get('/install.js', (req, res) => {
    console.log('📱 GET /install.js route accessed. Query:', req.query);
    const domain = req.query.DOMAIN;
    if (domain) {
        const authUrl = `https://${domain}/oauth/authorize/?client_id=${APP_ID}&response_type=code&scope=${APP_SCOPE}&redirect_uri=${BASE_URL}/oauth/callback`;
        console.log('🔀 Redirecting to OAuth:', authUrl);
        return res.redirect(authUrl);
    }
    res.send(getInstallationHTML(req));
});

// ###############################################
// ## THIS IS THE MISSING PIECE YOU NEED TO ADD ##
// ###############################################
// POST handler for Bitrix24 installation
app.post('/install.js', (req, res) => {
    console.log('📱 POST /install.js route accessed. Body:', req.body);
    const domain = req.body.DOMAIN || req.query.DOMAIN;
    if (domain) {
        const authUrl = `https://${domain}/oauth/authorize/?client_id=${APP_ID}&response_type=code&scope=${APP_SCOPE}&redirect_uri=${BASE_URL}/oauth/callback`;
        console.log('🔀 Redirecting to OAuth:', authUrl);
        return res.redirect(authUrl);
    }
    res.status(400).send("Domain parameter is missing.");
});
// ###############################################
// ## END OF THE MISSING PIECE                  ##
// ###############################################


// OAuth callback handler
app.get('/oauth/callback', async (req, res) => {
    const { code, domain } = req.query;
    console.log('🔄 OAuth callback received for domain:', domain);

    if (!code || !domain) {
        return res.status(400).send("Missing code or domain parameter in OAuth callback.");
    }
    
    try {
        const tokenUrl = `https://${domain}/oauth/token/`;
        const tokenData = {
            grant_type: 'authorization_code',
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code,
            scope: APP_SCOPE
        };
        const tokenResponse = await axios.post(tokenUrl, querystring.stringify(tokenData));
        const tokenResult = tokenResponse.data;

        if (tokenResult.access_token) {
            console.log('✅ Access token received!');
            
            // NOTE: Here you should securely save the access token and domain
            // to your .env file or a database for persistence.
            // For Render, you would update your environment variables.
            console.log("!!!!!!!!!! IMPORTANT !!!!!!!!!!");
            console.log(`Your Domain: ${domain}`);
            console.log(`Your Access Token: ${tokenResult.access_token}`);
            console.log("You MUST save these to your .env file or Render Environment variables!");

            const appInstaller = new CustomChannelApp(domain, tokenResult.access_token);
            const installResult = await appInstaller.install();
            
            res.send(getInstallResultHTML(installResult, tokenResult.access_token));
        } else {
            throw new Error('Failed to get access token: ' + JSON.stringify(tokenResult));
        }
    } catch (error) {
        console.error('❌ OAuth callback error:', error.response?.data || error.message);
        res.status(500).send("An error occurred during the OAuth process.");
    }
});


// We also need to move the `CustomChannelApp` class to its own file to keep things clean.
// I will provide that in the next step. For now, let's add placeholder functions for HTML.

function getInstallationHTML(req) { /* ... keep your existing HTML generation function here ... */ }
function getInstallResultHTML(installResult, accessToken) { /* ... keep your existing HTML generation function here ... */ }
function getAppWidgetHTML() { /* ... keep your existing HTML generation function here ... */ }


// --- Start Server ---
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Main App URL: ${BASE_URL}/app/widget`);
    console.log(`🔧 Install endpoint: ${BASE_URL}/install.js`);
});
