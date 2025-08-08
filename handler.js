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
        
        // Cache for CRM entities
        this.contactCache = new Map();
        this.leadCache = new Map();
        
        // Bind methods to ensure 'this' context is preserved
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
     * Extract clean phone number from WhatsApp JID
     */
    extractPhoneNumber(jid) {
        // Remove @s.whatsapp.net or @g.us
        return jid.replace(/@[sg]\.(?:whatsapp\.net|us)/, '');
    }
    
    /**
     * Enhanced incoming message handler that creates/updates CRM entities
     */
    async handleIncomingWhatsAppMessage(message) {
        try {
            const messageData = {
                messageId: message.key.id,
                from: message.key.remoteJid,
                phoneNumber: this.extractPhoneNumber(message.key.remoteJid),
                text: message.message.conversation || 
                      message.message.extendedTextMessage?.text || 
                      message.message.imageMessage?.caption ||
                      '[Media Message]',
                timestamp: message.messageTimestamp,
                messageType: Object.keys(message.message)[0],
                pushName: message.pushName || 'Unknown'
            };
            
            console.log('📨 Processing WhatsApp message:', {
                from: messageData.phoneNumber,
                name: messageData.pushName,
                preview: messageData.text.substring(0, 50)
            });
            
            // Emit to frontend
            this.emit('message_received', messageData);
            
            // Process in Bitrix24 CRM
            await this.processCRMIntegration(messageData);
            
        } catch (error) {
            console.error('❌ Error handling incoming message:', error.message);
            this.emit('error', 'Failed to process incoming message: ' + error.message);
        }
    }
    
    /**
     * Process CRM integration for incoming messages
     */
    async processCRMIntegration(messageData) {
        try {
            if (!this.config.bitrix24Domain || !this.config.accessToken) {
                console.warn('⚠️ Bitrix24 credentials not configured');
                return;
            }
            
            // Check if contact exists
            let contactId = await this.findOrCreateContact(messageData);
            
            // Check if there's an open lead
            let leadId = await this.findOrCreateLead(messageData, contactId);
            
            // Log the message as an activity
            await this.createActivity(messageData, contactId, leadId);
            
            // Send to Open Channels if configured
            await this.sendToOpenChannels(messageData, contactId);
            
        } catch (error) {
            console.error('❌ CRM integration error:', error.message);
        }
    }
    
    /**
     * Find or create a contact in Bitrix24
     */
    async findOrCreateContact(messageData) {
        try {
            const phoneNumber = messageData.phoneNumber;
            
            // Check cache first
            if (this.contactCache.has(phoneNumber)) {
                return this.contactCache.get(phoneNumber);
            }
            
            // Search for existing contact
            const searchUrl = `https://${this.config.bitrix24Domain}/rest/crm.contact.list`;
            const searchResponse = await axios.post(searchUrl, {
                filter: { 
                    'PHONE': phoneNumber 
                },
                select: ['ID', 'NAME', 'LAST_NAME'],
                access_token: this.config.accessToken
            });
            
            if (searchResponse.data?.result?.length > 0) {
                const contactId = searchResponse.data.result[0].ID;
                this.contactCache.set(phoneNumber, contactId);
                console.log('✅ Found existing contact:', contactId);
                return contactId;
            }
            
            // Create new contact
            const createUrl = `https://${this.config.bitrix24Domain}/rest/crm.contact.add`;
            const createResponse = await axios.post(createUrl, {
                fields: {
                    NAME: messageData.pushName || 'WhatsApp User',
                    TYPE_ID: 'CLIENT',
                    SOURCE_ID: 'OTHER',
                    SOURCE_DESCRIPTION: 'WhatsApp',
                    PHONE: [{ 
                        VALUE: phoneNumber, 
                        VALUE_TYPE: 'MOBILE' 
                    }],
                    COMMENTS: `First message: ${messageData.text}`
                },
                access_token: this.config.accessToken
            });
            
            if (createResponse.data?.result) {
                const contactId = createResponse.data.result;
                this.contactCache.set(phoneNumber, contactId);
                console.log('✅ Created new contact:', contactId);
                return contactId;
            }
            
        } catch (error) {
            console.error('❌ Contact management error:', error.message);
        }
        return null;
    }
    
    /**
     * Find or create a lead for the conversation
     */
    async findOrCreateLead(messageData, contactId) {
        try {
            const phoneNumber = messageData.phoneNumber;
            
            // Check cache
            if (this.leadCache.has(phoneNumber)) {
                return this.leadCache.get(phoneNumber);
            }
            
            // Search for open leads
            const searchUrl = `https://${this.config.bitrix24Domain}/rest/crm.lead.list`;
            const searchResponse = await axios.post(searchUrl, {
                filter: { 
                    'PHONE': phoneNumber,
                    'STATUS_ID': ['NEW', 'IN_PROCESS'] // Only open leads
                },
                select: ['ID', 'TITLE'],
                access_token: this.config.accessToken
            });
            
            if (searchResponse.data?.result?.length > 0) {
                const leadId = searchResponse.data.result[0].ID;
                this.leadCache.set(phoneNumber, leadId);
                console.log('✅ Found existing lead:', leadId);
                return leadId;
            }
            
            // Create new lead
            const createUrl = `https://${this.config.bitrix24Domain}/rest/crm.lead.add`;
            const createResponse = await axios.post(createUrl, {
                fields: {
                    TITLE: `WhatsApp: ${messageData.pushName || phoneNumber}`,
                    STATUS_ID: 'NEW',
                    SOURCE_ID: 'OTHER',
                    SOURCE_DESCRIPTION: 'WhatsApp Message',
                    PHONE: [{ 
                        VALUE: phoneNumber, 
                        VALUE_TYPE: 'MOBILE' 
                    }],
                    COMMENTS: messageData.text,
                    CONTACT_ID: contactId
                },
                access_token: this.config.accessToken
            });
            
            if (createResponse.data?.result) {
                const leadId = createResponse.data.result;
                this.leadCache.set(phoneNumber, leadId);
                console.log('✅ Created new lead:', leadId);
                return leadId;
            }
            
        } catch (error) {
            console.error('❌ Lead management error:', error.message);
        }
        return null;
    }
    
    /**
     * Create an activity for the message
     */
    async createActivity(messageData, contactId, leadId) {
        try {
            const url = `https://${this.config.bitrix24Domain}/rest/crm.activity.add`;
            
            const activityData = {
                fields: {
                    SUBJECT: `WhatsApp: ${messageData.text.substring(0, 50)}`,
                    DESCRIPTION: messageData.text,
                    TYPE_ID: 'MESSAGE',
                    DIRECTION: messageData.pushName === 'Agent' ? 'OUTGOING' : 'INCOMING',
                    COMPLETED: 'Y',
                    PRIORITY: 'NORMAL',
                    PROVIDER_ID: 'WHATSAPP',
                    PROVIDER_TYPE_ID: 'IM',
                    COMMUNICATIONS: [{
                        TYPE: 'PHONE',
                        VALUE: messageData.phoneNumber
                    }]
                },
                access_token: this.config.accessToken
            };
            
            // Add bindings
            const bindings = [];
            if (contactId) {
                bindings.push({
                    OWNER_TYPE_ID: 3, // Contact
                    OWNER_ID: contactId
                });
            }
            if (leadId) {
                bindings.push({
                    OWNER_TYPE_ID: 1, // Lead
                    OWNER_ID: leadId
                });
            }
            
            if (bindings.length > 0) {
                activityData.fields.BINDINGS = bindings;
            }
            
            const response = await axios.post(url, activityData);
            
            if (response.data?.result) {
                console.log('✅ Activity created:', response.data.result);
            }
            
        } catch (error) {
            console.error('❌ Activity creation error:', error.message);
        }
    }
    
    /**
     * Send message to Bitrix24 Open Channels
     */
    async sendToOpenChannels(messageData, contactId) {
        try {
            const url = `https://${this.config.bitrix24Domain}/rest/imopenlines.message.send`;
            
            await axios.post(url, {
                CONNECTOR: 'whatsapp_custom',
                LINE: 'whatsapp',
                MESSAGES: [{
                    user: {
                        id: messageData.phoneNumber,
                        name: messageData.pushName || 'WhatsApp User',
                        phone: messageData.phoneNumber
                    },
                    message: {
                        text: messageData.text,
                        date: Math.floor(Date.now() / 1000)
                    }
                }],
                access_token: this.config.accessToken
            });
            
            console.log('✅ Message sent to Open Channels');
            
        } catch (error) {
            // Open Channels might not be configured, this is okay
            console.log('ℹ️ Open Channels not configured or not available');
        }
    }

    /**
     * Send message to Bitrix24 (legacy method for compatibility)
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
     * Send outgoing message via WhatsApp with CRM activity logging
     */
    async sendOutgoingMessage(chatId, message, files = []) {
    try {
        if (!this.sock || !this.isConnected) {
            throw new Error('WhatsApp not connected');
        }

        // Clean and format the phone number properly
        let cleanChatId = chatId.toString().trim();
        
        // Remove any non-numeric characters except +
        cleanChatId = cleanChatId.replace(/[^\d+]/g, '');
        
        // Remove leading zeros
        cleanChatId = cleanChatId.replace(/^0+/, '');
        
        // Handle different phone number formats
        if (cleanChatId.startsWith('+')) {
            cleanChatId = cleanChatId.substring(1); // Remove the +
        }
        
        // For UAE numbers (971), ensure proper formatting
        if (cleanChatId.startsWith('971')) {
            // Already has country code
        } else if (cleanChatId.startsWith('5') && cleanChatId.length === 9) {
            // UAE mobile without country code
            cleanChatId = '971' + cleanChatId;
        } else if (cleanChatId.startsWith('05') && cleanChatId.length === 10) {
            // UAE mobile with leading 0
            cleanChatId = '971' + cleanChatId.substring(1);
        }
        
        // Add WhatsApp suffix if not present
        if (!cleanChatId.includes('@')) {
            cleanChatId = cleanChatId + '@s.whatsapp.net';
        }
        
        console.log('📱 Formatted phone number:', cleanChatId);
        
        // Check if the number exists on WhatsApp first
        try {
            const [result] = await this.sock.onWhatsApp(cleanChatId.replace('@s.whatsapp.net', ''));
            if (!result || !result.exists) {
                throw new Error('This phone number is not registered on WhatsApp');
            }
            console.log('✅ Number verified on WhatsApp:', result.jid);
            cleanChatId = result.jid; // Use the verified JID
        } catch (checkError) {
            console.error('⚠️ Could not verify number on WhatsApp:', checkError.message);
            // Continue anyway, might still work
        }
        
        // Send the message with timeout handling
        const sendPromise = this.sock.sendMessage(cleanChatId, { text: message });
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Message send timeout after 30 seconds')), 30000);
        });
        
        // Race between send and timeout
        await Promise.race([sendPromise, timeoutPromise]);
        
        console.log('✅ Outgoing message sent to WhatsApp:', { 
            chatId: cleanChatId, 
            messageLength: message.length 
        });
        
        // Log as CRM activity
        const phoneNumber = this.extractPhoneNumber(cleanChatId);
        const contactId = this.contactCache.get(phoneNumber);
        const leadId = this.leadCache.get(phoneNumber);
        
        if (contactId || leadId) {
            await this.createActivity({
                phoneNumber: phoneNumber,
                text: message,
                pushName: 'Agent'
            }, contactId, leadId);
        }
        
        return { success: true, chatId: cleanChatId };
        
    } catch (error) {
        console.error('❌ Error sending WhatsApp message:', error.message);
        console.error('📊 Error details:', {
            errorType: error.name,
            errorMessage: error.message,
            chatId: chatId
        });
        this.emit('error', 'Failed to send message: ' + error.message);
        throw error;
    }
}

// ALSO ADD THIS METHOD for better session handling:

/**
 * Get stored session for a specific Bitrix24 domain
 */
getSessionPath(domain) {
    // Use domain-specific auth directory instead of socket-specific
    const sanitizedDomain = domain.replace(/[^a-z0-9]/gi, '_');
    return `./auth_${sanitizedDomain}`;
}

/**
 * Initialize WhatsApp with persistent session
 */
async initWhatsAppWithSession(domain) {
    try {
        // Use domain-based auth directory for persistence
        const authDir = this.getSessionPath(domain);
        
        // Check if session exists
        if (fs.existsSync(authDir)) {
            const files = fs.readdirSync(authDir);
            if (files.length > 0) {
                console.log('📁 Found existing session for domain:', domain);
                this.config.authDir = authDir;
            }
        } else {
            // Create new session directory
            fs.mkdirSync(authDir, { recursive: true });
            this.config.authDir = authDir;
            console.log('📁 Created new session directory for domain:', domain);
        }
        
        // Now initialize WhatsApp with the persistent session
        await this.initWhatsApp();
        
    } catch (error) {
        console.error('❌ Error initializing with session:', error.message);
        throw error;
    }
}
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            whatsappConnected: !!(this.sock && this.isConnected),
            activeSessions: this.chatSessions.size,
            connectionAttempts: this.connectionAttempts,
            hasSocket: !!this.sock,
            socketState: this.sock?.ws?.readyState || 'unknown',
            cachedContacts: this.contactCache.size,
            cachedLeads: this.leadCache.size
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
            this.contactCache.clear();
            this.leadCache.clear();
            
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
