// lib/customChannelApp.js (Fixed Version - Corrected API Methods)
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
        console.log('📦 Starting installation process for connector:', this.connectorId);
        
        try {
            // Step 1: Check if connector already exists
            console.log('1️⃣ Checking existing connectors...');
            await this.checkExistingConnectors();

            // Step 2: Register the connector
            console.log('2️⃣ Registering connector...');
            const connectorResult = await this.registerConnector();
            if (!connectorResult || !connectorResult.result) {
                 throw new Error(`Failed to register connector. Response: ${JSON.stringify(connectorResult)}`);
            }
            console.log('✅ Connector registered successfully.');

            // Step 3: Set connector data to make it visible in the UI
            console.log('3️⃣ Setting connector data...');
            const connectorDataResult = await this.setConnectorData();
            if (!connectorDataResult || !connectorDataResult.result) {
                console.warn('⚠️ Could not set connector data. The connector might not be visible in some UI lists, but should still be functional.');
            } else {
                console.log('✅ Connector data set successfully.');
            }

            // Step 4: Create Open Line configuration
            console.log('4️⃣ Creating Open Line configuration...');
            const openLineResult = await this.createOpenLineConfig();
            if (!openLineResult || !openLineResult.result) {
                console.warn('⚠️ Could not create Open Line config, but this might be okay if one already exists.');
            } else {
                console.log('✅ Open Line configuration created successfully.');
            }

            // Step 5: Bind placement for UI access (optional)
            console.log('5️⃣ Binding placement in Contact Center...');
            try {
                const placementResult = await this.bindPlacement();
                if (placementResult && placementResult.result) {
                    console.log('✅ Placement bound successfully.');
                } else {
                    console.warn('⚠️ Placement binding failed, but this is optional.');
                }
            } catch (placementError) {
                console.warn('⚠️ Placement binding failed (optional):', placementError.message);
            }
            
            // Step 6: Set up event handlers for integration
            console.log('6️⃣ Setting up event handlers...');
            const eventResult = await this.setupEventHandlers();
            console.log('✅ Event handlers setup process completed.');

            return {
                success: true,
                message: 'Installation completed successfully',
                domain: this.bitrix24Domain,
                connectorId: this.connectorId
            };

        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            return {
                success: false,
                error: `Installation error: ${error.message}`,
                message: 'Installation failed - please check configuration',
                domain: this.bitrix24Domain
            };
        }
    }

    async checkExistingConnectors() {
        console.log('🔍 Checking existing connectors...');
        try {
            const result = await this.callBitrix24Method('imconnector.list');
            if (result && result.result) {
                console.log('📋 Existing connectors:', Object.keys(result.result));
                if (result.result[this.connectorId]) {
                    console.log('ℹ️ Connector already exists, will update it.');
                }
            }
        } catch (error) {
            console.log('⚠️ Could not check existing connectors:', error.message);
        }
    }

    async registerConnector() {
        console.log('🔌 Registering WhatsApp connector...');
        
        // First try to unregister if it exists
        try {
            await this.callBitrix24Method('imconnector.unregister', {
                ID: this.connectorId
            });
            console.log('🗑️ Previous connector unregistered');
        } catch (error) {
            console.log('ℹ️ No previous connector to unregister (this is normal)');
        }

        const params = {
            ID: this.connectorId,
            NAME: 'Custom WhatsApp Connector',
        };
        return await this.callBitrix24Method('imconnector.register', params);
    }

    async setConnectorData() {
        console.log('📊 Setting connector data for visibility...');
        
        const connectorData = {
            name: 'Custom WhatsApp',
            description: 'Connect your WhatsApp to Bitrix24 Open Channels',
            url: `${this.baseUrl}/handler.js`,
            url_im: `${this.baseUrl}/handler.js`,
            icon_file: '', // Optional: can add icon URL later
            register: true,
            active: true
        };

        const params = {
            ID: this.connectorId,
            DATA: JSON.stringify(connectorData)
        };

        return await this.callBitrix24Method('imconnector.connector.data.set', params);
    }

    async createOpenLineConfig() {
        console.log('📞 Creating Open Line configuration...');
        
        try {
            // First check if config already exists
            const existingConfigs = await this.callBitrix24Method('imopenlines.config.list.get');
            
            const params = {
                QUEUE_TYPE: 'all', // or 'strictly_specified'
                CHECK_AVAILABLE: 'Y',
                ACTIVE: 'Y',
                LINE_NAME: 'WhatsApp Channel',
                CRM: 'Y',
                CRM_CREATE: 'lead', // or 'contact'
                WELCOME_MESSAGE: 'Hello! Thank you for contacting us via WhatsApp.',
                // Add other configuration parameters as needed
            };

            return await this.callBitrix24Method('imopenlines.config.add', params);
        } catch (error) {
            console.log('⚠️ Open Line config creation failed:', error.message);
            // This might fail if the user doesn't have permission or if config already exists
            return null;
        }
    }

    async bindPlacement() {
        console.log('🔗 Binding placement for Contact Center UI...');
        
        const params = {
            PLACEMENT: 'CONTACT_CENTER', // This is the correct placement for Open Lines
            HANDLER: `${this.baseUrl}/handler.js`,
            TITLE: 'WhatsApp Connector',
            DESCRIPTION: 'Manage your WhatsApp connection',
            GROUP_NAME: 'WhatsApp Integration'
        };
        
        try {
            // Unbind first to prevent duplicates
            await this.callBitrix24Method('placement.unbind', {
                PLACEMENT: 'CONTACT_CENTER',
                HANDLER: `${this.baseUrl}/handler.js`
            });
        } catch (error) {
            // Ignore unbind errors
        }
        
        return await this.callBitrix24Method('placement.bind', params);
    }
    
    async setupEventHandlers() {
        console.log('🎯 Setting up event handlers for incoming messages...');
        
        // Using correct event names for Bitrix24 webhooks
        const events = [
            'OnImMessageAdd',           // When a message is added to IM
            'OnCrmLeadAdd',            // When a new lead is created
            'OnCrmContactAdd',         // When a new contact is created
            'OnImConnectorMessageAdd'   // When a connector message is added (if available)
        ];
        
        const results = [];
        
        for (const event of events) {
            try {
                // Unbind first to prevent duplicate handlers on re-installation
                await this.callBitrix24Method('event.unbind', {
                    EVENT: event,
                    HANDLER: `${this.baseUrl}/webhook`,
                });

                const result = await this.callBitrix24Method('event.bind', {
                    EVENT: event,
                    HANDLER: `${this.baseUrl}/webhook`,
                });
                
                if (result && result.result) {
                    results.push({ event, result, success: true });
                    console.log(`✅ Event ${event} bound successfully.`);
                } else {
                    results.push({ event, error: 'No result returned', success: false });
                    console.log(`⚠️ Event ${event} binding unclear result.`);
                }
            } catch (eventError) {
                console.log(`⚠️ Event ${event} binding failed:`, eventError.message);
                results.push({ event, error: eventError.message, success: false });
            }
        }
        
        return results;
    }

    // Method to send test message to verify connector works
    async sendTestMessage(chatId, message) {
        console.log('🧪 Sending test message via connector...');
        
        const params = {
            CONNECTOR: this.connectorId,
            CHAT_ID: chatId,
            MESSAGE: message,
            USER_ID: 'test_user',
            DATE_CREATE: new Date().toISOString()
        };

        return await this.callBitrix24Method('imconnector.send.messages', params);
    }

    // Method to check connector status
    async getConnectorStatus() {
        console.log('📊 Checking connector status...');
        
        try {
            const connectors = await this.callBitrix24Method('imconnector.list');
            const openLines = await this.callBitrix24Method('imopenlines.config.list.get');
            
            return {
                connectors: connectors.result || {},
                openLines: openLines.result || {},
                isRegistered: connectors.result && connectors.result[this.connectorId] ? true : false
            };
        } catch (error) {
            console.error('❌ Error checking connector status:', error);
            return { error: error.message };
        }
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${this.accessToken}/${method}.json`;
        
        console.log(`🌐 Calling Bitrix24 method: ${method}`);
        console.log(`📋 Parameters:`, JSON.stringify(params, null, 2));
        
        try {
            const response = await axios.post(url, querystring.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            
            console.log(`📥 Response for [${method}]:`, JSON.stringify(response.data, null, 2));
            
            if (response.data && response.data.error) {
                const errorDescription = response.data.error_description || response.data.error;
                console.error(`❌ API Error for [${method}]: ${errorDescription}`);
                throw new Error(`${response.data.error} - ${errorDescription}`);
            }
            
            console.log(`✅ Success for [${method}]`);
            return response.data;
            
        } catch (error) {
            if (error.response) {
                console.error('❌ HTTP Error Response:');
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
                throw new Error(`HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            
            // Network or other error
            console.error('❌ Network/Other Error:', error.message);
            throw error;
        }
    }
}

module.exports = CustomChannelApp;
