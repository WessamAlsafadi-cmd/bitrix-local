/**
 * WhatsApp to Bitrix24 Message Handler (Open Lines Version)
 * Using Baileys.js for WhatsApp connection with proper Bitrix24 Open Lines integration
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
    authDir: './whatsapp_auth'
};

if (!config.bitrix24Domain || !config.accessToken) {
    console.warn('⚠️ Missing required config: bitrix24Domain and accessToken');
}

// Create a proper logger for Baileys - JavaScript compatible
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
    }
    
    /**
     * Initialize WhatsApp connection
     */
    async initWhatsApp() {
        try {
            console.log('🔄 Initializing WhatsApp connection...');
            
            const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
            
            this.sock = makeWASocket({
                auth: state,
                logger: logger, // Use our custom logger
                browser: ['WhatsApp Bitrix24 Bot', 'Desktop', '1.0.0'],
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true
            });
            
            this.sock.ev.on('creds.update', saveCreds);
            
            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log('📱 QR Code received. Emitting to frontend...');
                    this.emit('qr', qr);
                }
                
                if (connection === 'close') {
                    const error = lastDisconnect && lastDisconnect.error;
                    const shouldReconnect = error && error.output && error.output.statusCode !== DisconnectReason.loggedOut;

                    console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                    this.emit('status', 'Connection Closed. Reconnecting...');
                    
                    if (shouldReconnect) {
                        setTimeout(() => {
                            console.log('🔄 Attempting to reconnect...');
                            this.initWhatsApp();
                        }, 5000);
                    } else {
                        this.emit('status', 'Logged Out. Please scan QR again.');
                    }
                } else if (connection === 'open') {
                    console.log('✅ WhatsApp connection opened successfully!');
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
            
            console.log('📱 WhatsApp client initialized.');
            this.emit('status', 'Initializing WhatsApp... Please wait.');
            
        } catch (error) {
            console.error('❌ Error initializing WhatsApp:', error);
            this.emit('status', 'Error initializing WhatsApp: ' + error.message);
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
                timestamp: new Date(timestamp * 1000).toISOString()
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
            return '📍 Location: ' + message.message.locationMessage.degreesLatitude + ', ' + message.message.locationMessage.degreesLongitude;
        }
        
        if (message.message.contactMessage) {
            return '👤 Contact: ' + message.message.contactMessage.displayName;
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
            chatId: chatId,
            senderName: senderName,
            bitrixUserId: this.generateBitrixUserId(chatId),
            createdAt: new Date(),
            lastActivity: new Date(),
            messageCount: 0
        };
        
        this.chatSessions.set(chatId, session);
        console.log('📝 Created new chat session for: ' + senderName + ' (' + chatId + ')');
        
        return session;
    }
    
    /**
     * Generate a consistent Bitrix24 user ID from WhatsApp chat ID
     */
    generateBitrixUserId(chatId) {
        // Remove @ and convert to a consistent format
        return chatId.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }
    
    /**
     * Send message data to Bitrix24 using Open Lines approach
     */
    async sendToBitrix24(messageData) {
        try {
            console.log('📤 Sending message to Bitrix24 via Open Lines:', messageData.messageId);
            
            // Method 1: Try Open Lines network join + message
            try {
                // First, join the user to the network
                const joinResult = await this.callBitrix24Method('imopenlines.network.join', {
                    CODE: messageData.userId
                });
                
                if (joinResult.result) {
                    console.log('✅ User joined Open Lines network');
                }
                
                // Then send the message
                const messageResult = await this.callBitrix24Method('imopenlines.network.message.add', {
                    USER_CODE: messageData.userId,
                    MESSAGE: messageData.message,
                    SYSTEM: 'N'
                });
                
                if (messageResult.result) {
                    console.log('✅ Message sent to Bitrix24 via Open Lines network');
                    return messageResult;
                }
            } catch (networkError) {
                console.log('⚠️ Open Lines network method failed, trying chat.add:', networkError.message);
            }
            
            // Method 2: Try imopenlines.chat.add
            try {
                const chatResult = await this.callBitrix24Method('imopenlines.chat.add', {
                    USER_CODE: messageData.userId,
                    LINE_NAME: 'WhatsApp',
                    USER_NAME: messageData.userName,
                    MESSAGE: messageData.message
                });
                
                if (chatResult.result) {
                    console.log('✅ Message sent to Bitrix24 via Open Lines chat.add');
                    return chatResult;
                }
            } catch (chatError) {
                console.log('⚠️ Open Lines chat.add failed:', chatError.message);
            }
            
            // Method 3: Create a CRM activity as fallback
            try {
                // First try to find or create a contact
                let contactId = await this.findOrCreateContact(messageData.userId, messageData.userName);
                
                const activityResult = await this.callBitrix24Method('crm.activity.add', {
                    fields: {
                        'OWNER_TYPE_ID': 3, // Contact
                        'OWNER_ID': contactId || 1,
                        'TYPE_ID': 4, // Call type
                        'SUBJECT': 'WhatsApp Message',
                        'DESCRIPTION': 'WhatsApp message from ' + messageData.userName + ' (' + messageData.userId + '):\n\n' + messageData.message,
                        'START_TIME': messageData.timestamp,
                        'END_TIME': messageData.timestamp,
                        'COMPLETED': 'N',
                        'PRIORITY': 2,
                        'RESPONSIBLE_ID': 1
                    }
                });
                
                if (activityResult.result) {
                    console.log('✅ Message logged as CRM activity');
                    return activityResult;
                }
            } catch (activityError) {
                console.log('⚠️ CRM activity creation failed:', activityError.message);
            }
            
            throw new Error('All Bitrix24 integration methods failed');
            
        } catch (error) {
            console.error('❌ Failed to send to Bitrix24:', error);
            
            // Queue the message for retry
            this.messageQueue.push({
                messageData: messageData,
                retryCount: 0,
                timestamp: Date.now()
            });
            
            this.processMessageQueue();
        }
    }
    
    /**
     * Find or create contact in Bitrix24
     */
    async findOrCreateContact(whatsappUserId, userName) {
        try {
            const phoneNumber = whatsappUserId.replace('@s.whatsapp.net', '').replace('@c.us', '');
            
            // Try to find existing contact by phone
            const searchResult = await this.callBitrix24Method('crm.contact.list', {
                filter: { PHONE: phoneNumber },
                select: ['ID', 'NAME', 'LAST_NAME']
            });
            
            if (searchResult.result && searchResult.result.length > 0) {
                const contact = searchResult.result[0];
                console.log('✅ Found existing contact: ' + contact.NAME + ' (ID: ' + contact.ID + ')');
                return contact.ID;
            }
            
            // Create new contact
            const nameParts = (userName || 'WhatsApp Contact').split(' ');
            const firstName = nameParts[0] || 'WhatsApp';
            const lastName = nameParts.slice(1).join(' ') || 'Contact';
            
            const newContact = await this.callBitrix24Method('crm.contact.add', {
                fields: {
                    NAME: firstName,
                    LAST_NAME: lastName,
                    PHONE: [
                        {
                            VALUE: phoneNumber,
                            VALUE_TYPE: 'MOBILE'
                        }
                    ],
                    SOURCE_ID: 'WEBFORM',
                    SOURCE_DESCRIPTION: 'WhatsApp Integration',
                    COMMENTS: 'Created from WhatsApp: ' + whatsappUserId
                }
            });
            
            if (newContact.result) {
                console.log('✅ Created new contact: ' + firstName + ' ' + lastName + ' (ID: ' + newContact.result + ')');
                return newContact.result;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Error finding/creating contact:', error);
            return null;
        }
    }
    
    /**
     * Process queued messages for retry
     */
    async processMessageQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        console.log('📋 Processing message queue (' + this.messageQueue.length + ' messages)');
        
        while (this.messageQueue.length > 0) {
            const queueItem = this.messageQueue.shift();
            
            if (queueItem.retryCount >= 3) {
                console.log('⚠️ Message retry limit reached, discarding:', queueItem.messageData.messageId);
                continue;
            }
            
            try {
                await this.sendToBitrix24(queueItem.messageData);
                console.log('✅ Queued message processed successfully');
            } catch (error) {
                queueItem.retryCount++;
                if (queueItem.retryCount < 3) {
                    this.messageQueue.push(queueItem);
                    console.log('⚠️ Message queued for retry (attempt ' + (queueItem.retryCount + 1) + ')');
                }
            }
            
            // Wait between retries
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.isProcessingQueue = false;
    }
    
    /**
     * Process auto-reply logic
     */
    async processAutoReply(chatId, messageText, session) {
        try {
            // Simple auto-reply logic - can be customized
            const lowerMessage = messageText.toLowerCase();
            
            // Welcome message for new sessions
            if (session.messageCount === 0) {
                await this.sendWhatsAppMessage(chatId, 
                    "👋 Hello! Thank you for contacting us via WhatsApp. Your message has been received and we'll get back to you soon!");
                session.messageCount++;
                return;
            }
            
            // Keyword-based responses
            if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
                await this.sendWhatsAppMessage(chatId, 
                    "Hello! How can we assist you today?");
            } else if (lowerMessage.includes('help')) {
                await this.sendWhatsAppMessage(chatId, 
                    "We're here to help! Your message has been forwarded to our team. Someone will respond shortly.");
            }
            
            session.messageCount++;
            session.lastActivity = new Date();
            
        } catch (error) {
            console.error('❌ Error processing auto-reply:', error);
        }
    }
    
    /**
     * Send WhatsApp message
     */
    async sendWhatsAppMessage(chatId, message) {
        try {
            if (!this.sock) {
                throw new Error('WhatsApp socket not initialized');
            }
            
            await this.sock.sendMessage(chatId, { text: message });
            console.log('📱 Sent WhatsApp message to ' + chatId + ': ' + message.substring(0, 50) + '...');
            
        } catch (error) {
            console.error('❌ Error sending WhatsApp message:', error);
            throw error;
        }
    }
    
    /**
     * Send WhatsApp message from Bitrix24 (for outgoing messages)
     */
    async sendOutgoingMessage(chatId, message, files) {
        files = files || [];
        
        try {
            if (!this.sock) {
                throw new Error('WhatsApp socket not initialized');
            }
            
            // Send text message
            if (message) {
                await this.sock.sendMessage(chatId, { text: message });
            }
            
            // Send files if any
            for (const file of files) {
                if (file.type === 'image') {
                    await this.sock.sendMessage(chatId, {
                        image: { url: file.url },
                        caption: file.caption || ''
                    });
                } else if (file.type === 'document') {
                    await this.sock.sendMessage(chatId, {
                        document: { url: file.url },
                        fileName: file.name || 'document'
                    });
                }
            }
            
            console.log('📤 Sent outgoing message to ' + chatId);
            return true;
            
        } catch (error) {
            console.error('❌ Error sending outgoing message:', error);
            throw error;
        }
    }
    
    /**
     * Call Bitrix24 REST API method
     */
    async callBitrix24Method(method, params) {
        params = params || {};
        const url = 'https://' + this.config.bitrix24Domain + '/rest/' + method;
        
        try {
            const requestData = Object.assign({}, params, { access_token: this.config.accessToken });
            
            const response = await axios.post(url, requestData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            console.log('📤 Request URL: ' + url);
            console.log('📤 Request data:', JSON.stringify(Object.assign({}, params, { access_token: '[hidden]' }), null, 2));
            console.log('📊 Response:', JSON.stringify(response.data, null, 2));
            
            if (response.data.error) {
                throw new Error('Bitrix24 API error: ' + (response.data.error_description || response.data.error));
            }
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Bitrix24 API call failed (' + method + '):', error.message);
            throw error;
        }
    }
    
    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            whatsappConnected: this.sock && this.sock.user,
            bitrix24Domain: this.config.bitrix24Domain,
            activeSessions: this.chatSessions.size,
            queuedMessages: this.messageQueue.length,
            uptime: process.uptime()
        };
    }
    
    /**
     * Disconnect WhatsApp
     */
    async disconnect() {
        try {
            if (this.sock) {
                await this.sock.logout();
                this.sock = null;
            }
            
            this.chatSessions.clear();
            this.messageQueue = [];
            
            console.log('📴 WhatsApp disconnected');
            this.emit('status', 'Disconnected');
            
        } catch (error) {
            console.error('❌ Error disconnecting WhatsApp:', error);
        }
    }
    
    /**
     * Clean up resources
     */
    async cleanup() {
        console.log('🧹 Cleaning up WhatsApp handler...');
        
        // Process remaining queued messages
        if (this.messageQueue.length > 0) {
            console.log('📋 Processing ' + this.messageQueue.length + ' remaining messages...');
            await this.processMessageQueue();
        }
        
        // Disconnect WhatsApp
        await this.disconnect();
        
        // Clear all sessions
        this.chatSessions.clear();
        
        console.log('✅ Cleanup completed');
    }
}

module.exports = WhatsAppBitrix24Handler;
