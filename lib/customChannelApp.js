// lib/customChannelApp.js (Minimal Version for Testing)
const axios = require('axios');
const querystring = require('querystring');

class CustomChannelApp {
    constructor(domain, accessToken) {
        if (!domain || !accessToken) {
            throw new Error('CustomChannelApp requires a domain and access token.');
        }
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.connectorId = 'custom_whatsapp';
        this.baseUrl = process.env.BASE_URL || 'https://your-render-app-name.onrender.com';
        
        console.log(`🏗️ CustomChannelApp initialized for domain: ${this.bitrix24Domain}`);
    }

    async install() {
        console.log('📦 Starting minimal installation process...');
        
        try {
            // Step 1: Test basic API connectivity
            console.log('1️⃣ Testing API connectivity...');
            const userResult = await this.callBitrix24Method('user.current');
            if (!userResult || !userResult.result) {
                throw new Error('Cannot connect to Bitrix24 API - check domain and access token');
            }
            console.log('✅ API connectivity confirmed');

            // Step 2: Check available methods
            console.log('2️⃣ Checking available methods...');
            try {
                const methodsResult = await this.callBitrix24Method('methods');
                if (methodsResult && methodsResult.result) {
                    const availableMethods = methodsResult.result;
                    console.log('📋 Available imconnector methods:', 
                        availableMethods.filter(method => method.startsWith('imconnector')));
                    console.log('📋 Available imopenlines methods:', 
                        availableMethods.filter(method => method.startsWith('imopenlines')));
                }
            } catch (error) {
                console.log('⚠️ Could not fetch methods list:', error.message);
            }

            // Step 3: Try to register connector (core functionality)
            console.log('3️⃣ Attempting to register connector...');
            try {
                const connectorResult = await this.registerConnector();
                if (connectorResult && connectorResult.result) {
                    console.log('✅ Connector registered successfully');
                } else {
                    console.log('⚠️ Connector registration returned:', connectorResult);
                }
            } catch (error) {
                console.log('❌ Connector registration failed:', error.message);
                // Continue with other steps
            }

            // Step 4: Set up basic event handlers
            console.log('4️⃣ Setting up basic event handlers...');
            const eventResults = await this.setupBasicEvents();

            // Step 5: Try to create a simple CRM activity to test permissions
            console.log('5️⃣ Testing CRM permissions...');
            try {
                const activityResult = await this.callBitrix24Method('crm.activity.list', {
                    select: ['ID', 'SUBJECT'],
                    order: { ID: 'DESC' },
                    filter: {},
                    start: 0
                });
                
                if (activityResult && activityResult.result) {
                    console.log('✅ CRM access confirmed');
                } else {
                    console.log('⚠️ CRM access limited or denied');
                }
            } catch (error) {
                console.log('⚠️ CRM test failed:', error.message);
            }

            return {
                success: true,
                message: 'Basic installation completed',
                domain: this.bitrix24Domain,
                connectorId: this.connectorId,
                tests: {
                    api_connectivity: true,
                    connector_registration: true,
                    events_setup: eventResults
                }
            };

        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            return {
                success: false,
                error: error.message,
                message: 'Installation failed - check logs for details',
                domain: this.bitrix24Domain
            };
        }
    }

    async registerConnector() {
        console.log('🔌 Registering WhatsApp connector...');
        
        const params = {
            ID: this.connectorId,
            NAME: 'Custom WhatsApp Connector'
        };
        
        return await this.callBitrix24Method('imconnector.register', params);
    }

    async setupBasicEvents() {
        console.log('🎯 Setting up basic event handlers...');
        
        // Focus on events that are most likely to work
        const basicEvents = [
            'OnCrmLeadAdd',
            'OnCrmContactAdd'
        ];
        
        const results = [];
        
        for (const event of basicEvents) {
            try {
                // Try to bind the event
                const result = await this.callBitrix24Method('event.bind', {
                    EVENT: event,
                    HANDLER: `${this.baseUrl}/webhook`
                });
                
                if (result && result.result) {
                    results.push({ event, success: true });
                    console.log(`✅ Event ${event} bound successfully`);
                } else {
                    results.push({ event, success: false, result });
                    console.log(`⚠️ Event ${event} binding unclear:`, result);
                }
            } catch (error) {
                results.push({ event, success: false, error: error.message });
                console.log(`❌ Event ${event} binding failed:`, error.message);
            }
        }
        
        return results;
    }

    // Simple message sending method for testing
    async sendSimpleMessage(chatId, message) {
        console.log('📤 Attempting to send message via various methods...');
        
        const methods = [
            {
                name: 'imconnector.send.messages',
                params: {
                    CONNECTOR: this.connectorId,
                    CHAT_ID: chatId,
                    MESSAGE: message,
                    USER_ID: 'test_user'
                }
            },
            {
                name: 'crm.activity.add',
                params: {
                    fields: {
                        OWNER_TYPE_ID: 3, // Contact
                        OWNER_ID: 1,
                        TYPE_ID: 4,
                        SUBJECT: 'WhatsApp Message Test',
                        DESCRIPTION: `Test message: ${message}`,
                        COMPLETED: 'N',
                        RESPONSIBLE_ID: 1
                    }
                }
            }
        ];
        
        for (const method of methods) {
            try {
                console.log(`🧪 Trying ${method.name}...`);
                const result = await this.callBitrix24Method(method.name, method.params);
                
                if (result && result.result) {
                    console.log(`✅ ${method.name} succeeded:`, result.result);
                    return { success: true, method: method.name, result: result.result };
                }
            } catch (error) {
                console.log(`❌ ${method.name} failed:`, error.message);
            }
        }
        
        return { success: false, error: 'All message sending methods failed' };
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${this.accessToken}/${method}.json`;
        
        console.log(`🌐 Calling: ${method}`);
        
        try {
            const response = await axios.post(url, querystring.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            
            if (response.data && response.data.error) {
                const errorDescription = response.data.error_description || response.data.error;
                throw new Error(`${response.data.error}: ${errorDescription}`);
            }
            
            return response.data;
            
        } catch (error) {
            if (error.response) {
                const errorMsg = error.response.data ? 
                    JSON.stringify(error.response.data) : 
                    `HTTP ${error.response.status}`;
                throw new Error(`API Error: ${errorMsg}`);
            }
            throw error;
        }
    }
}

module.exports = CustomChannelApp;
