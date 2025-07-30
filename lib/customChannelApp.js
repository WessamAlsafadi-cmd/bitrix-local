// lib/customChannelApp.js (Fixed Version)
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
            // Step 1: Register the connector
            console.log('1️⃣ Registering connector...');
            const connectorResult = await this.registerConnector();
            if (!connectorResult || !connectorResult.result) {
                 throw new Error(`Failed to register connector. Response: ${JSON.stringify(connectorResult)}`);
            }
            console.log('✅ Connector registered successfully.');

            // Step 2: Activate the connector
            console.log('2️⃣ Activating connector...');
            const activationResult = await this.activateConnector();
             if (!activationResult || !activationResult.result) {
                throw new Error(`Failed to activate connector. Response: ${JSON.stringify(activationResult)}`);
            }
            console.log('✅ Connector activated successfully.');

            // Step 3: Set connector data to make it visible in the UI
            console.log('3️⃣ Setting connector data...');
            const connectorDataResult = await this.setConnectorData();
             if (!connectorDataResult || !connectorDataResult.result) {
                // This is a common point of failure, but we can continue without it.
                console.warn('⚠️ Could not set connector data. The connector might not be visible in some UI lists, but should still be functional.');
            } else {
                console.log('✅ Connector data set successfully.');
            }

            // Step 4: Bind placement for UI access in the Contact Center
            console.log('4️⃣ Binding placement in Contact Center...');
            const placementResult = await this.bindPlacement();
             if (!placementResult || !placementResult.result) {
                throw new Error(`Failed to bind placement. Response: ${JSON.stringify(placementResult)}`);
            }
            console.log('✅ Placement bound successfully.');
            
            // Step 5: Set up event handlers for integration
            console.log('5️⃣ Setting up event handlers...');
            const eventResult = await this.setupEventHandlers();
            console.log('✅ Event handlers setup process completed.');

            return {
                success: true,
                message: 'Installation completed successfully',
                domain: this.bitrix24Domain,
            };

        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            // This structure returns the detailed error back to your installer.js
            return {
                success: false,
                error: `Bitrix24 API error: ${error.message}`,
                message: 'Installation failed - please check configuration',
                domain: this.bitrix24Domain
            };
        }
    }

    async registerConnector() {
        console.log('🔌 Registering WhatsApp connector...');
        const params = {
            ID: this.connectorId,
            NAME: 'Custom WhatsApp', // The name that appears in Bitrix24
            // ICON_FILE is optional, can be added later
        };
        return await this.callBitrix24Method('imconnector.register', params);
    }
    
    async activateConnector() {
        console.log('⚡ Activating connector...');
        const params = {
            CONNECTOR: this.connectorId,
            ACTIVE: 'Y'
        };
        return await this.callBitrix24Method('imconnector.activate', params);
    }

    async setConnectorData() {
        console.log('📊 Setting connector data for visibility...');
        
        // FIXED: The 'DATA' parameter must be a JSON-encoded string.
        const connectorData = {
            name: 'Custom WhatsApp',
            description: 'Connect your WhatsApp to Bitrix24 Open Channels',
            url: `${this.baseUrl}/handler.js`,
            url_im: `${this.baseUrl}/handler.js`
        };

        const params = {
            ID: this.connectorId,
            DATA: JSON.stringify(connectorData)
        };

        return await this.callBitrix24Method('imconnector.connector.data.set', params);
    }

    async bindPlacement() {
        console.log('🔗 Binding placement for Contact Center UI...');
        
        // FIXED: Using CONTACT_CENTER as the placement, as recommended by documentation for adding to this specific page.
        const params = {
            PLACEMENT: 'CONTACT_CENTER',
            HANDLER: `${this.baseUrl}/handler.js`,
            TITLE: 'Custom WhatsApp Connector',
            DESCRIPTION: 'Manage your WhatsApp connection'
        };
        
        return await this.callBitrix24Method('placement.bind', params);
    }
    
    async setupEventHandlers() {
        console.log('🎯 Setting up event handlers for incoming messages...');
        
        // Using uppercase event names as is standard for Bitrix24 webhooks
        const events = [
            'OnImMessageAdd',
            'OnCrmLeadAdd',
            'OnCrmContactAdd'
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
                results.push({ event, result, success: true });
                console.log(`✅ Event ${event} bound successfully.`);
            } catch (eventError) {
                console.log(`⚠️ Event ${event} binding failed:`, eventError.message);
                results.push({ event, error: eventError.message, success: false });
            }
        }
        
        return results;
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${this.accessToken}/${method}.json`;
        
        console.log(`🌐 Calling Bitrix24 method: ${method}`);
        
        try {
            const response = await axios.post(url, querystring.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            
            // FIXED: More robust error checking for the Bitrix24 API response format.
            if (response.data && response.data.error) {
                const errorDescription = response.data.error_description || response.data.error;
                console.error(`❌ API Error for [${method}]: ${errorDescription}`);
                throw new Error(`${response.data.error} - ${errorDescription}`);
            }
            
            console.log(`✅ Success for [${method}]`);
            return response.data;
            
        } catch (error) {
            // This will catch both network errors and the thrown API errors from above.
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                throw new Error(`HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            // Rethrow the original error if it's not an axios error (e.g., our custom thrown error)
            throw error;
        }
    }
}

module.exports = CustomChannelApp;
