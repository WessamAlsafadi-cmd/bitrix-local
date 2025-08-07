const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
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

// Create a proper logger for Baileys - completely silent
const logger = {
    level: 'silent',
    child: () => logger,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
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
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.isConnected = false;
        this.lastQRTime = 0;
        
        // Bind this context to methods
        this.initWhatsApp = this.initWhatsApp.bind(this);
        this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
        this.cleanup = this.cleanup.bind(this);
        
        // Ensure auth directory exists
        this.ensureAuthDirectory();
    }
    
    /**
     * Ensure auth directory exists
     */
    ensureAuthDirectory() {
        try {
            if (!fs.existsSync(this.config.authDir)) {
                fs.mkdirSync(this.config.authDir, { recursive: true });
                console.log('📁 Created auth directory:', this.config.authDir);
            }
        } catch (error) {
            console.error('❌ Error creating auth directory:', error.message);
        }
    }
    
    /**
     * Initialize WhatsApp connection with better error handling and QR management
     */
    async initWhatsApp() {
        try {
            // Prevent multiple simultaneous initialization attempts
            if (this.sock && !this.sock.ws.isClosed) {
                console.log('🔄 WhatsApp already initializing or connected');
                return;
            }
            
            this.connectionAttempts++;
            console.log(`🔄 Initializing WhatsApp connection... (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
            
            if (this.connectionAttempts > this.maxConnectionAttempts) {
                throw new Error('Max connection attempts reached');
            }
            
            this.emit('status', `Initializing WhatsApp... (${this.connectionAttempts}/${this.maxConnectionAttempts})`);
            
            const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
            
            this.sock = makeWASocket({
                auth: state,
                logger: logger,
                browser: ['WhatsApp Bitrix24 Bot', 'Desktop', '1.0.0'],
                printQRInTerminal: false, // Disable terminal QR to avoid conflicts
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                qrTimeout: 60000, // 60 second timeout
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                // Additional options for better stability
                getMessage: async (key) => {
                    return { conversation: '' };
                }
            });
            
            // Set up event listeners with error handling
            this.sock.ev.on('creds.update', async (creds) => {
                try {
                    await saveCreds();
                    console.log('🔐 Credentials updated and saved');
                } catch (error) {
                    console.error('❌ Error saving credentials:', error.message);
                }
            });
            
            this.sock.ev.on('connection.update', this.handleConnectionUpdate);
            
            this.sock.ev.on('messages.upsert', async (m) => {
                try {
                    for (const message of m.messages) {
                        if (!message.key.fromMe && message.message) {
                            await this.handleIncomingWhatsAppMessage(message);
                        }
                    }
                } catch (error) {
                    console.error('❌ Error processing incoming messages:', error.message);
                }
            });
            
            // Add connection state monitoring
            this.sock.ev.on('connection.update', (update) => {
                if (update.connection === 'open') {
                    this.isConnected = true;
                    this.connectionAttempts = 0; // Reset on successful connection
                }
            });
            
            console.log('📱 WhatsApp client initialized successfully');
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error.message);
            this.emit('status', 'Error initializing WhatsApp: ' + error.message);
            this.emit('error', error.message);
            
            // Cleanup and retry with exponential backoff
            await this.cleanup();
            
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const retryDelay = Math.min(1000 * Math.pow(2, this.connectionAttempts - 1), 30000);
                console.log(`🔄 Retrying WhatsApp initialization in ${retryDelay}ms...`);
                setTimeout(() => {
                    this.initWhatsApp();
                }, retryDelay);
            } else {
                this.emit('status', 'Failed to connect after maximum attempts. Please try again.');
                this.connectionAttempts = 0; // Reset for manual retry
            }
        }
    }
    
    /**
     * Handle connection updates with improved QR code handling
     */
    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        const now = Date.now();
        
        console.log('🔄 Connection update:', {
            connection,
            hasQR: !!qr,
            hasError: !!lastDisconnect?.error,
            isNewLogin,
            timestamp: new Date().toISOString()
        });
        
        // Handle QR code with rate limiting
        if (qr) {
            // Rate limit QR code emission (max once per 5 seconds)
            if (now - this.lastQRTime > 5000) {
                this.lastQRTime = now;
                console.log('📱 New QR Code generated');
                console.log('📱 QR Code length:', qr.length);
                console.log('📱 QR Code preview:', qr.substring(0, 50) + '...');
                
                try {
                    // Emit QR code to frontend
                    this.emit('qr', qr);
                    this.emit('status', 'QR Code generated. Please scan with WhatsApp.');
                    console.log('✅ QR Code emitted to frontend successfully');
                } catch (emitError) {
                    console.error('❌ Failed to emit QR code:', emitError.message);
                }
            } else {
                console.log('📱 QR Code rate limited - ignoring duplicate');
            }
        }
        
        if (connection === 'close') {
            this.isConnected = false;
            const error = lastDisconnect?.error;
            let shouldReconnect = false;
            let reconnectDelay = 5000;
            
            if (error) {
                const statusCode = error.output?.statusCode;
                console.log('❌ Connection closed with error:', {
                    message: error.message,
                    statusCode,
                    errorType: typeof error
                });
                
                // Determine if we should reconnect based on error type
                switch (statusCode) {
                    case DisconnectReason.loggedOut:
                        shouldReconnect = false;
                        this.emit('status', 'Logged out. Please scan QR code again.');
                        // Clear auth data on logout
                        this.clearAuthData();
                        break;
                    case DisconnectReason.connectionClosed:
                    case DisconnectReason.connectionLost:
                    case DisconnectReason.connectionReplaced:
                        shouldReconnect = true;
                        reconnectDelay = 3000;
                        break;
                    case DisconnectReason.timedOut:
                        shouldReconnect = true;
                        reconnectDelay = 10000;
                        break;
                    case DisconnectReason.badSession:
                        shouldReconnect = true;
                        this.clearAuthData(); // Clear bad session data
                        break;
                    case DisconnectReason.restartRequired:
                        shouldReconnect = true;
                        break;
                    default:
                        shouldReconnect = this.connectionAttempts < this.maxConnectionAttempts;
                }
            } else {
                shouldReconnect = this.connectionAttempts < this.maxConnectionAttempts;
            }
            
            this.emit('status', shouldReconnect ? 'Connection lost. Reconnecting...' : 'Connection closed.');
            
            if (shouldReconnect) {
                console.log(`🔄 Scheduling reconnection in ${reconnectDelay}ms...`);
                setTimeout(() => {
                    if (!this.isConnected) { // Only reconnect if still not connected
                        console.log('🔄 Attempting to reconnect...');
                        this.initWhatsApp();
                    }
                }, reconnectDelay);
            }
            
        } else if (connection === 'connecting') {
            console.log('🔄 Connecting to WhatsApp...');
            this.emit('status', 'Connecting to WhatsApp...');
            
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connection opened successfully!');
            this.isConnected = true;
            this.connectionAttempts = 0; // Reset attempts on successful connection
            this.emit('status', 'Successfully connected to WhatsApp!');
            this.emit('connected');
            
            // Log connection info
            if (this.sock?.user) {
                console.log('👤 Connected as:', this.sock.user.id);
            }
        }
    }
    
    /**
     * Clear authentication data
     */
    clearAuthData() {
        try {
            if (fs.existsSync(this.config.authDir)) {
                const files = fs.readdirSync(this.config.authDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(this.config.authDir, file));
                });
                console.log('🗑️ Cleared authentication data');
            }
        } catch (error) {
            console.error('❌ Error clearing auth data:', error.message);
        }
    }
    
    /**
     * Handle incoming WhatsApp messages
     */
    async handleIncomingWhatsAppMessage(message) {
        try {
            const messageData = {
                messageId: message.key.id,
                from: message.key.remoteJid,
                text: message.message.conversation || 
                      message.message.extendedTextMessage?.text || 
                      message.message.imageMessage?.caption ||
                      '[Media Message]',
                timestamp: message.messageTimestamp,
                messageType: Object.keys(message.message)[0]
            };
            
            console.log('📨 Incoming WhatsApp message:', {
                messageId: messageData.messageId,
                from: messageData.from,
                type: messageData.messageType,
                preview: messageData.text.substring(0, 100)
            });
            
            this.emit('message_received', messageData);
            await this.sendToBitrix24(messageData);
            
        } catch (error) {
            console.error('❌ Error handling incoming message:', error.message);
            this.emit('error', 'Failed to process incoming message: ' + error.message);
        }
    }

    /**
     * Send message to Bitrix24
     */
    async sendToBitrix24(messageData) {
        try {
            if (!this.config.bitrix24Domain || !this.config.accessToken) {
                console.warn('⚠️ Missing Bitrix24 configuration for message forwarding');
                return;
            }

            const url = `https://${this.config.bitrix24Domain}/rest/im.message.add`;
            const response = await axios.post(url, {
                DIALOG_ID: messageData.from,
                MESSAGE: messageData.text,
                access_token: this.config.accessToken
            }, {
                timeout: 10000
            });
            
            console.log('✅ Message sent to Bitrix24:', {
                messageId: messageData.messageId,
                success: response.data?.result
            });
            
        } catch (error) {
            console.error('❌ Error sending to Bitrix24:', error.message);
            // Don't throw here to avoid breaking the message processing flow
        }
    }

    /**
     * Send outgoing message via WhatsApp
     */
    async sendOutgoingMessage(chatId, message, files = []) {
        try {
            if (!this.sock || !this.isConnected) {
                throw new Error('WhatsApp not connected');
            }

            // Clean up chatId format
            const cleanChatId = chatId.includes('@s.whatsapp.net') ? 
                chatId : 
                `${chatId}@s.whatsapp.net`;

            await this.sock.sendMessage(cleanChatId, { text: message });
            console.log('✅ Outgoing message sent to WhatsApp:', { 
                chatId: cleanChatId, 
                messageLength: message.length 
            });
            
        } catch (error) {
            console.error('❌ Error sending WhatsApp message:', error.message);
            this.emit('error', 'Failed to send message: ' + error.message);
            throw error;
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            whatsappConnected: !!(this.sock && this.isConnected),
            activeSessions: this.chatSessions.size,
            connectionAttempts: this.connectionAttempts,
            hasSocket: !!this.sock,
            socketState: this.sock?.ws?.readyState || 'unknown'
        };
    }

    /**
     * Disconnect WhatsApp
     */
    async disconnect() {
        try {
            this.isConnected = false;
            if (this.sock) {
                console.log('🔌 Disconnecting WhatsApp...');
                await this.sock.logout();
                console.log('🔌 WhatsApp disconnected');
            }
        } catch (error) {
            console.error('❌ Error during disconnect:', error.message);
        } finally {
            this.sock = null;
        }
    }

    /**
     * Cleanup handler resources
     */
    async cleanup() {
        try {
            this.isConnected = false;
            
            if (this.sock) {
                // Remove all event listeners
                this.sock.ev.removeAllListeners();
                
                // Close WebSocket connection if exists
                if (this.sock.ws && !this.sock.ws.isClosed) {
                    this.sock.ws.close();
                }
                
                this.sock = null;
            }
            
            this.chatSessions.clear();
            this.messageQueue = [];
            
            console.log('🧹 Handler cleaned up successfully');
            
        } catch (error) {
            console.error('❌ Error during cleanup:', error.message);
        }
    }

    /**
     * Force restart connection
     */
    async restartConnection() {
        console.log('🔄 Force restarting WhatsApp connection...');
        this.connectionAttempts = 0;
        await this.cleanup();
        setTimeout(() => {
            this.initWhatsApp();
        }, 2000);
    }
}

module.exports = WhatsAppBitrix24Handler;
