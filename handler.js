/**
 * WhatsApp to Bitrix24 Message Handler
 * Using Baileys.js for WhatsApp connection
 */

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const config = {
    bitrix24Domain: process.env.BITRIX24_DOMAIN,
    accessToken: process.env.BITRIX24_ACCESS_TOKEN,
    port: process.env.PORT || 3000,
    authDir: './whatsapp_auth', // This will create the folder automatically
    connectorId: process.env.CONNECTOR_ID || 'custom_whatsapp'
};



class WhatsAppBitrix24Handler {
    constructor(config) {
        this.config = {
            bitrix24Domain: config.bitrix24Domain,
            accessToken: config.accessToken,
            connectorId: 'custom_whatsapp',
            port: config.port || 3000,
            authDir: config.authDir || './auth_info_baileys',
            ...config
        };
        
        this.sock = null;
        this.app = express();
        this.chatSessions = new Map(); // WhatsApp ID -> Bitrix24 Chat ID mapping
        
        this.setupExpress();
    }
    
    /**
     * Initialize WhatsApp connection
     */
    async initWhatsApp() {
        const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
        
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: console,
            browser: ['Custom WhatsApp Bot', 'Desktop', '1.0.0']
        });
        
        // Handle credentials update
        this.sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const error = lastDisconnect?.error;
                const isBoom = error?.isBoom;
                const shouldReconnect = !isBoom || error.output?.statusCode !== DisconnectReason.loggedOut;

                console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                
                if (shouldReconnect) {
                    this.initWhatsApp();
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened successfully!');
            }
        });
        
        // Handle incoming messages
        this.sock.ev.on('messages.upsert', async (m) => {
            for (const message of m.messages) {
                if (!message.key.fromMe && message.message) {
                    await this.handleIncomingWhatsAppMessage(message);
                }
            }
        });
        
        console.log('WhatsApp client initialized. Please scan QR code if needed.');
    }
    
    /**
     * Handle incoming WhatsApp message and send to Bitrix24
     */
    async handleIncomingWhatsAppMessage(message) {
        try {
            const whatsappId = message.key.remoteJid;
            const messageText = this.extractMessageText(message);
            const senderName = message.pushName || whatsappId.split('@')[0];
            
            if (!messageText) return;
            
            console.log(`Received WhatsApp message from ${senderName}: ${messageText}`);
            
            // Get or create Bitrix24 chat session
            let chatId = this.chatSessions.get(whatsappId);
            if (!chatId) {
                chatId = `wa_${whatsappId.replace('@s.whatsapp.net', '')}_${Date.now()}`;
                this.chatSessions.set(whatsappId, chatId);
            }
            
            // Send message to Bitrix24
            await this.sendToBitrix24(chatId, messageText, {
                id: whatsappId,
                name: senderName,
                avatar: ''
            });
            
            // Create lead if first message
            if (!this.chatSessions.has(whatsappId + '_lead_created')) {
                await this.createBitrix24Lead(senderName, whatsappId, messageText);
                this.chatSessions.set(whatsappId + '_lead_created', true);
            }
            
        } catch (error) {
            console.error('Error handling WhatsApp message:', error);
        }
    }
    
    /**
     * Extract text from WhatsApp message
     */
    extractMessageText(message) {
        if (message.message.conversation) {
            return message.message.conversation;
        } else if (message.message.extendedTextMessage) {
            return message.message.extendedTextMessage.text;
        } else if (message.message.imageMessage) {
            return message.message.imageMessage.caption || '[Image]';
        } else if (message.message.videoMessage) {
            return message.message.videoMessage.caption || '[Video]';
        } else if (message.message.documentMessage) {
            return `[Document: ${message.message.documentMessage.fileName}]`;
        }
        return null;
    }
    
    /**
     * Send message to Bitrix24 Open Channel
     */
    async sendToBitrix24(chatId, messageText, from) {
        const params = {
            CONNECTOR: this.config.connectorId,
            LINE: 1,
            MESSAGES: [{
                im: {
                    chat_id: chatId,
                    message_id: `wa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    date: new Date().toISOString(),
                    from: from,
                    message: {
                        text: messageText
                    }
                },
                chat: {
                    id: chatId,
                    name: `WhatsApp: ${from.name}`
                }
            }]
        };
        
        try {
            const response = await this.callBitrix24('imconnector.send.messages', params);
            console.log('Message sent to Bitrix24:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending to Bitrix24:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Create lead in Bitrix24 CRM
     */
    async createBitrix24Lead(name, whatsappId, firstMessage) {
        const params = {
            FIELDS: {
                TITLE: `WhatsApp Lead: ${name}`,
                NAME: name,
                SOURCE_ID: 'OTHER',
                SOURCE_DESCRIPTION: 'WhatsApp Custom Connector',
                PHONE: [{
                    VALUE: whatsappId.replace('@s.whatsapp.net', ''),
                    VALUE_TYPE: 'MOBILE'
                }],
                COMMENTS: `First message: ${firstMessage}`,
                ASSIGNED_BY_ID: 1 // Assign to admin, change as needed
            }
        };
        
        try {
            const response = await this.callBitrix24('crm.lead.add', params);
            console.log('Lead created in Bitrix24:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error creating lead:', error.response?.data || error.message);
        }
    }
    
    /**
     * Setup Express server for receiving Bitrix24 webhooks
     */
    setupExpress() {
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });
        
        // Webhook endpoint for Bitrix24 agent replies
        this.app.post('/bitrix24/webhook', async (req, res) => {
            await this.handleBitrix24Webhook(req, res);
        });
        
        // Connector status endpoint
        this.app.get('/connector/status', async (req, res) => {
            try {
                const status = await this.getConnectorStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Start server
        this.app.listen(this.config.port, () => {
            console.log(`Server running on port ${this.config.port}`);
        });
    }
    
    /**
     * Handle webhook from Bitrix24 (agent replies)
     */
    async handleBitrix24Webhook(req, res) {
        try {
            const data = req.body;
            console.log('Received Bitrix24 webhook:', data);
            
            // Process agent reply and send to WhatsApp
            if (data.event === 'ONIMMESSAGEADD' && data.data && data.data.MESSAGE) {
                await this.handleAgentReply(data.data);
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    /**
     * Handle agent reply from Bitrix24 and send to WhatsApp
     */
    async handleAgentReply(messageData) {
        try {
            const chatId = messageData.CHAT_ID;
            const messageText = messageData.MESSAGE;
            
            // Find WhatsApp ID from chat ID
            const whatsappId = this.findWhatsAppIdByChatId(chatId);
            if (!whatsappId) {
                console.log('WhatsApp ID not found for chat:', chatId);
                return;
            }
            
            // Send message to WhatsApp
            await this.sock.sendMessage(whatsappId, { text: messageText });
            console.log(`Sent reply to WhatsApp ${whatsappId}: ${messageText}`);
            
        } catch (error) {
            console.error('Error handling agent reply:', error);
        }
    }
    
    /**
     * Find WhatsApp ID by Bitrix24 chat ID
     */
    findWhatsAppIdByChatId(chatId) {
        for (const [whatsappId, storedChatId] of this.chatSessions.entries()) {
            if (storedChatId === chatId) {
                return whatsappId;
            }
        }
        return null;
    }
    
    /**
     * Get connector status from Bitrix24
     */
    async getConnectorStatus() {
        const params = {
            CONNECTOR: this.config.connectorId
        };
        
        const response = await this.callBitrix24('imconnector.status', params);
        return response.data;
    }
    
    /**
     * Make API call to Bitrix24
     */
    async callBitrix24(method, params = {}) {
        const url = `https://${this.config.bitrix24Domain}/rest/${method}`;
        
        const data = {
            ...params,
            auth: this.config.accessToken
        };
        
        return await axios.post(url, new URLSearchParams(data), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    }
    
    /**
     * Start the complete handler
     */
    async start() {
        console.log('Starting WhatsApp-Bitrix24 Handler...');
        await this.initWhatsApp();
        console.log('Handler started successfully!');
    }
}

// Usage example
// Add this to the top of handler.js


const handler = new WhatsAppBitrix24Handler(config);
handler.start().catch(console.error);

module.exports = WhatsAppBitrix24Handler;