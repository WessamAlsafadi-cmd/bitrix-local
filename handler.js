const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const { EventEmitter } = require('events');
require('dotenv').config();

const config = {
    bitrix24Domain: process.env.BITRIX24_DOMAIN,
    accessToken: process.env.BITRIX24_ACCESS_TOKEN,
    port: process.env.PORT || 3000,
    authDir: './whatsapp_auth'
};

if (!config.bitrix24Domain || !config.accessToken) {
    console.warn('⚠️ Missing required config: bitrix24Domain and accessToken');
}

// Create a proper logger for Baileys
const logger = {
    level: 'silent',
    child: function() { return logger; },
    trace: function() {},
    debug: function() {},
    info: function() {},
    warn: function() {},
    error: function() {},
    fatal: function() {}
};

class WhatsAppBitrix24Handler extends EventEmitter {
    constructor(config) {
        super();
        this.config = {
            bitrix24Domain: config.bitrix24Domain,
            accessToken: config.accessToken,
            port: config.port || 3000,
            authDir: config.authDir || './auth_info_baileys',
            ...config
        };
        
        this.sock = null;
        this.chatSessions = new Map();
        this.messageQueue = [];
        this.isProcessingQueue = false;
        
        // Bind this context to methods
        this.initWhatsApp = this.initWhatsApp.bind(this);
        this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
    }
    
    /**
     * Initialize WhatsApp connection with better QR handling
     */
    async initWhatsApp() {
        try {
            console.log('🔄 Initializing WhatsApp connection...');
            
            const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
            
            this.sock = makeWASocket({
                auth: state,
                logger: logger,
                browser: ['WhatsApp Bitrix24 Bot', 'Desktop', '1.0.0'],
                printQRInTerminal: true, // Also print to terminal for debugging
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                qrTimeout: 90000 // 90 second timeout
            });
            
            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('connection.update', this.handleConnectionUpdate);
            
            this.sock.ev.on('messages.upsert', async (m) => {
                for (const message of m.messages) {
                    if (!message.key.fromMe && message.message) {
                        await this.handleIncomingWhatsAppMessage(message);
                    }
                }
            });
            
            console.log('📱 WhatsApp client initialized.');
            this.emit('status', 'Initializing WhatsApp... Please wait.');
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error);
            this.emit('status', 'Error initializing WhatsApp: ' + error.message);
            // Retry initialization after 10 seconds
            setTimeout(() => {
                console.log('🔄 Retrying WhatsApp initialization...');
                this.initWhatsApp();
            }, 10000);
        }
    }
    
    /**
     * Handle connection updates with better QR emission
     */
    handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    console.log('🔄 Connection update at: ' + new Date().toISOString(), { connection, hasQR: !!qr, hasError: !!lastDisconnect?.error });
    
    if (qr) {
        console.log('📱 QR Code received. Emitting to frontend...');
        console.log('📱 QR Code length:', qr.length);
        console.log('📱 QR Code preview:', qr.substring(0, 50) + '...');
        
        // Emit QR code to frontend
        this.emit('qr', qr);
        
        // Also emit status update
        this.emit('status', 'QR Code generated. Please scan with WhatsApp.');
    }
    
    if (connection === 'close') {
        const error = lastDisconnect?.error;
        let shouldReconnect = false;
        
        if (error) {
            const statusCode = error.output?.statusCode;
            shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log('❌ Connection closed:', {
                error: error.message,
                statusCode,
                shouldReconnect
            });
        }

        this.emit('status', 'Connection Closed. Reconnecting...');
        
        if (shouldReconnect) {
            setTimeout(() => {
                console.log('🔄 Attempting to reconnect...');
                this.initWhatsApp();
            }, 5000);
        } else {
            this.emit('status', 'Logged Out. Please scan QR again.');
        }
    } else if (connection === 'connecting') {
        console.log('🔄 Connecting to WhatsApp...');
        this.emit('status', 'Connecting to WhatsApp...');
    } else if (connection === 'open') {
        console.log('✅ WhatsApp connection opened successfully!');
        this.emit('status', 'Connected!');
        this.emit('connected');
    }
}
    
    async handleIncomingWhatsAppMessage(message) {
        try {
            const messageData = {
                messageId: message.key.id,
                from: message.key.remoteJid,
                text: message.message.conversation || message.message.extendedTextMessage?.text || '',
                timestamp: message.messageTimestamp
            };
            console.log('📨 Incoming WhatsApp message:', messageData);
            this.emit('message_received', messageData);
            await this.sendToBitrix24(messageData);
        } catch (error) {
            console.error('❌ Error handling incoming message:', error);
            this.emit('error', 'Failed to process incoming message: ' + error.message);
        }
    }

    async sendToBitrix24(messageData) {
        try {
            const url = `https://${this.config.bitrix24Domain}/rest/im.message.add`;
            const response = await axios.post(url, {
                DIALOG_ID: messageData.from,
                MESSAGE: messageData.text,
                access_token: this.config.accessToken
            });
            console.log('✅ Message sent to Bitrix24:', response.data);
        } catch (error) {
            console.error('❌ Error sending to Bitrix24:', error);
            throw error;
        }
    }

    async sendOutgoingMessage(chatId, message, files = []) {
        try {
            if (!this.sock) {
                throw new Error('WhatsApp not connected');
            }
            await this.sock.sendMessage(chatId, { text: message });
            console.log('✅ Outgoing message sent to WhatsApp:', { chatId, message });
        } catch (error) {
            console.error('❌ Error sending WhatsApp message:', error);
            this.emit('error', 'Failed to send message: ' + error.message);
        }
    }

    getConnectionStatus() {
        return {
            connected: !!this.sock,
            whatsappConnected: this.sock?.user ? true : false,
            activeSessions: this.chatSessions.size
        };
    }

    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
            console.log('🔌 WhatsApp disconnected');
        }
    }

    async cleanup() {
        await this.disconnect();
        this.chatSessions.clear();
        this.messageQueue = [];
        console.log('🧹 Handler cleaned up');
    }
}

module.exports = WhatsAppBitrix24Handler;
