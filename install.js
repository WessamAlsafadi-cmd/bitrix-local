/**
 * Bitrix24 Custom WhatsApp Connector - Main Application Server
 */
const express = require('express');
const http = require('http'); // <-- Add http
const { Server } = require("socket.io"); // <-- Add socket.io Server
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

// Import our refactored handler
const WhatsAppBitrix24Handler = require('./handler.js');

const app = express();
const server = http.createServer(app); // <-- Create an HTTP server
const io = new Server(server); // <-- Initialize Socket.IO on the server
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

    // Create a new handler instance for each user session if needed,
    // or use a single global handler. For simplicity, we'll use one.
    // NOTE: This simple setup supports only ONE WhatsApp connection for the whole app.
    const handlerConfig = {
        bitrix24Domain: process.env.BITRIX24_DOMAIN,
        accessToken: process.env.BITRIX24_ACCESS_TOKEN
    };

    const whatsAppHandler = new WhatsAppBitrix24Handler(handlerConfig);

    // Listen for events from our handler and relay them to the frontend
    whatsAppHandler.on('qr', (qr) => {
        console.log('Relaying QR to frontend...');
        socket.emit('qr', qr);
    });

    whatsAppHandler.on('status', (status) => {
        socket.emit('statusUpdate', status);
    });

    whatsAppHandler.on('connected', () => {
        socket.emit('statusUpdate', 'Successfully Connected!');
    });

    // When the frontend asks to start, initialize the handler
    socket.on('start-whatsapp', () => {
        console.log('Frontend requested WhatsApp start. Initializing...');
        if (handlerConfig.bitrix24Domain && handlerConfig.accessToken) {
            whatsAppHandler.initWhatsApp().catch(err => {
                console.error("Failed to init WhatsApp:", err);
                socket.emit('statusUpdate', 'Error: Could not start WhatsApp handler.');
            });
        } else {
            console.warn("Cannot start WhatsApp, Bitrix24 config is missing.");
            socket.emit('statusUpdate', 'Error: Bitrix24 domain or access token is not configured on the server.');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        // You might want to add logic here to clean up the WhatsApp connection
        // For now, we'll leave it running.
    });
});


// --- Express Routes ---

// The main application interface for Bitrix24 (this will show the QR code)
app.get('/app/widget', (req, res) => {
    res.send(getAppWidgetHTML());
});

// IMPORTANT: Keep your installation routes the same
// ... (Your existing /health, /, /install.js, and /oauth/callback routes go here)
// ... (I'm omitting them for brevity, but COPY THEM from your original file!)
// Make sure to replace hardcoded URLs with the BASE_URL variable for flexibility.
// Example change:
// const authUrl = `https://${domain}/oauth/authorize/?client_id=${APP_ID}&response_type=code&scope=${APP_SCOPE}&redirect_uri=${BASE_URL}/oauth/callback`;


// --- HTML Templates ---

function getAppWidgetHTML() {
    // This is the new UI for connecting WhatsApp
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Connector Handler</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #f7f7f7; color: #333; }
            #container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
            h1 { color: #128c7e; }
            #status { background: #eef; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; border-radius: 4px; text-align: left; }
            #qr-code { margin-top: 20px; min-height: 260px; display: flex; align-items: center; justify-content: center; }
            #qr-code img { max-width: 100%; height: auto; border: 1px solid #ddd; }
            .spinner { border: 4px solid rgba(0,0,0,0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #09d261; animation: spin 1s ease infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            button { background: #25d366; color: white; padding: 12px 25px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; transition: background 0.3s; }
            button:hover { background: #128c7e; }
        </style>
        <!-- QR Code generation library from a CDN -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
    </head>
    <body>
        <div id="container">
            <h1>WhatsApp Connector</h1>
            <p>Scan the QR code with your WhatsApp application to connect.</p>
            
            <div id="status">Connecting to server...</div>
            
            <div id="qr-code">
                <button id="connect-btn">Connect to WhatsApp</button>
            </div>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const statusDiv = document.getElementById('status');
            const qrDiv = document.getElementById('qr-code');
            const connectBtn = document.getElementById('connect-btn');

            socket.on('connect', () => {
                statusDiv.textContent = '✅ Server connected. Click the button to start.';
            });

            connectBtn.addEventListener('click', () => {
                statusDiv.innerHTML = 'Requesting QR Code... Please wait.';
                qrDiv.innerHTML = '<div class="spinner"></div>';
                socket.emit('start-whatsapp');
                connectBtn.style.display = 'none';
            });

            socket.on('statusUpdate', (message) => {
                statusDiv.textContent = message;
                if(message.includes('Connected')) {
                    qrDiv.innerHTML = '<h2>🎉 Connected!</h2>';
                }
            });

            socket.on('qr', (qrString) => {
                statusDiv.textContent = 'QR Code received. Please scan it.';
                qrDiv.innerHTML = ''; // Clear spinner
                
                // Use the qrcode-generator library to create the QR image
                const typeNumber = 4;
                const errorCorrectionLevel = 'L';
                const qr = qrcode(typeNumber, errorCorrectionLevel);
                qr.addData(qrString);
                qr.make();
                qrDiv.innerHTML = qr.createImgTag(6); // size 6
            });

            socket.on('disconnect', () => {
                statusDiv.textContent = '❌ Server disconnected. Please refresh.';
            });
        </script>
    </body>
    </html>
    `;
}

// And finally, start the server
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Main App URL: ${BASE_URL}/app/widget`);
    console.log(`🔧 Install endpoint: ${BASE_URL}/install.js`);
});
