/**
 * WhatsApp to Bitrix24 Message Handler (Refactored to be an EventEmitter)
 * Using Baileys.js for WhatsApp connection
 */
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const { EventEmitter } = require('events'); // <-- Import EventEmitter
require('dotenv').config();

// (No changes to config or validation)
const config = {
    bitrix24Domain: process.env.BITRIX24_DOMAIN,
    accessToken: process.env.BITRIX24_ACCESS_TOKEN,
    port: process.env.PORT || 3000,
    authDir: './whatsapp_auth',
    connectorId: process.env.CONNECTOR_ID || 'custom_whatsapp'
};

if (!config.bitrix24Domain || !config.accessToken) {
    console.warn('⚠️ Missing required config: bitrix24Domain and accessToken');
}

class WhatsAppBitrix24Handler extends EventEmitter { // <-- Extend EventEmitter
    constructor(config) {
        super(); // <-- Call super()
        this.config = {
            bitrix24Domain: config.bitrix24Domain,
            accessToken: config.accessToken,
            connectorId: 'custom_whatsapp',
            port: config.port || 3000,
            authDir: config.authDir || './auth_info_baileys',
            ...config
        };
        
        this.sock = null;
        this.chatSessions = new Map();
        // We will run the Express server from install.js, so remove it from here.
    }
    
    /**
     * Initialize WhatsApp connection
     */
    async initWhatsApp() {
        const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
        
        this.sock = makeWASocket({
            auth: state,
            logger: { level: 'silent' },
            browser: ['Custom WhatsApp Bot', 'Desktop', '1.0.0']
        });
        
        this.sock.ev.on('creds.update', saveCreds);
        
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code received. Emitting to frontend...');
                this.emit('qr', qr); // <-- EMIT the QR code
            }
            
            if (connection === 'close') {
                const error = lastDisconnect?.error;
                const isBoom = error?.isBoom;
                const shouldReconnect = !isBoom || error.output?.statusCode !== DisconnectReason.loggedOut;

                console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                this.emit('status', 'Connection Closed. Reconnecting...'); // <-- EMIT status
                
                if (shouldReconnect) {
                    this.initWhatsApp();
                } else {
                    this.emit('status', 'Logged Out. Please scan QR again.'); // <-- EMIT logged out status
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened successfully!');
                this.emit('status', 'Connected!'); // <-- EMIT connected status
                this.emit('connected'); // <-- EMIT connected event
            }
        });
        
        this.sock.ev.on('messages.upsert', async (m) => {
            for (const message of m.messages) {
                if (!message.key.fromMe && message.message) {
                    await this.handleIncomingWhatsAppMessage(message);
                }
            }
        });
        
        console.log('WhatsApp client initialized.');
        this.emit('status', 'Initializing WhatsApp... Please wait.');
    }
    
    // ... (Keep all other methods like handleIncomingWhatsAppMessage, sendToBitrix24, etc. exactly the same)
    // ... (No need to copy them all here, they don't need changes)

    // REMOVED ALL EXPRESS.JS AND SERVER LOGIC FROM THIS FILE
    // The handler is now just a controller, not a web server.
}

module.exports = WhatsAppBitrix24Handler;
