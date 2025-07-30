/**
 * WhatsApp to Bitrix24 Message Handler (Fixed Version)
 * Using Baileys.js for WhatsApp connection with proper Bitrix24 integration
 */
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const { EventEmitter } = require('events');
require('dotenv').config();

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

class WhatsAppBitrix24Handler extends EventEmitter {
    constructor(config) {
        super();
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
        this.messageQueue = [];
        this.isProcessingQueue = false;
    }
    
    /**
     * Initialize WhatsApp connection
     */
    async initWhatsApp() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
            
            this.sock = makeWASocket({
                auth: state,
                logger: { level: 'silent' },
                browser: ['Custom WhatsApp Bot', 'Desktop', '1.0.0'],
                printQRInTerminal: false
            });
            
            this.sock.ev.on('creds.update', saveCreds);
            
            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log('📱 QR Code received. Emitting to frontend...');
                    this.emit('qr', qr);
                }
                
                if (connection === 'close') {
                    const error = lastDisconnect?.error;
                    const isBoom = error?.isBoom;
                    const shouldReconnect = !isBoom || error.output?.statusCode !== DisconnectReason.loggedOut;

                    console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                    this.emit('status', 'Connection Closed. Reconnecting...');
                    
                    if (shouldReconnect) {
                        setTimeout(() => this.initWhatsApp(), 5000); // Retry after 5 seconds
                    } else {
                        this.emit('status', 'Logged Out. Please scan QR again.');
                    }
                } else if (connection === 'open') {
                    console.log('WhatsApp connection opened successfully!');
                    this.emit('status', 'Connected!');
                    this.emit('connected');
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
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error);
            this.emit('status', `Error initializing WhatsApp: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Handle incoming WhatsApp messages
     */
    async handleIncomingWhatsAppMessage(message) {
        try {
            console.log('📨 Received WhatsApp message:', message.key.id);
            
            const chatId = message.key.remoteJid;
            const messageText = this.extractMessageText(message);
            const senderName = message.pushName || 'Unknown';
            const timestamp = message.messageTimestamp;
            
            if (!messageText) {
                console.log('⚠️ No text content found in message');
                return;
            }
            
            // Create or get chat session
            const session = await this.getOrCreateChatSession(chatId, senderName);
            
            // Prepare message data for Bitrix24
            const messageData = {
                chatId: chatId,
                messageId: message.key.id,
                message: messageText,
                userId: session.bitrixUserId,
                userName: senderName,
                timestamp: new Date(timestamp * 1000).toISOString(),
                connector: this.config.connectorId
            };
            
            // Send to Bitrix24
            await this.sendToBitrix24(messageData);
            
            // Auto-reply or processing logic can be added here
            await this.processAutoReply(chatId, messageText, session);
            
        } catch (error) {
            console.error('❌ Error handling WhatsApp message:', error);
        }
    }
    
    /**
     * Extract text content from WhatsApp message
     */
    extractMessageText(message) {
        if (message.message.conversation) {
            return message.message.conversation;
        }
        
        if (message.message.extendedTextMessage) {
            return message.message.extendedTextMessage.text;
        }
        
        if (message.message.imageMessage && message.message.imageMessage.caption) {
            return message.message.imageMessage.caption;
        }
        
        if (message.message.videoMessage && message.message.videoMessage.caption) {
            return message.message.videoMessage.caption;
        }
        
        if (message.message.documentMessage && message.message.documentMessage.caption) {
            return message.message.documentMessage.caption;
        }
        
        // Handle other message types
        if (message.message.locationMessage) {
            return `📍 Location: ${message.message.locationMessage.degreesLatitude}, ${message.message.locationMessage.degreesLongitude}`;
        }
        
        if (message.message.contactMessage) {
            return `👤 Contact: ${message.message.contactMessage.displayName}`;
        }
        
        return null;
    }
    
    /**
     * Get or create chat session for contact management
     */
    async getOrCreateChatSession(chatId, senderName) {
        if (this.chatSessions.has(chatId)) {
            return this.chatSessions.get(chatId);
        }
        
        // Create new session
        const session = {
            chatId,
            senderName,
            bitrixUserId: this.generateBitrixUserId(chatId),
            createdAt: new Date(),
            lastActivity: new Date(),
            messageCount: 0
        };
        
        this.chatSessions.set(chatId, session);
        console.log(`📝 Created new chat session for: ${senderName} (${chatId})`);
        
        // Try to create/find contact in Bitrix24
        await this.createOrFindBitrixContact(session);
        
        return session;
    }
    
    /**
     * Generate a consistent Bitrix24 user ID from WhatsApp chat ID
     */
    generateBitrixUserId(chatId) {
        // Remove @ and convert to a consistent format
        return chatId.replace('@s.whatsapp
