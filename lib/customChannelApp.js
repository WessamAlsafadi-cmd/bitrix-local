// lib/customChannelApp.js
const axios = require('axios');
const querystring = require('querystring');

class CustomChannelApp {
    constructor(domain, accessToken) {
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.connectorId = 'custom_whatsapp';
        // Use an environment variable for the base URL to be flexible
        this.baseUrl = process.env.BASE_URL || 'https://your-render-app-name.onrender.com';
    }

    async install() {
        try {
            console.log('🔄 Starting installation steps...');
            
            await this.registerConnector();
            console.log('✅ Connector registered');
            
            await this.bindPlacement();
            console.log('✅ Placement bound');
            
            return {
                success: true,
                message: 'Custom WhatsApp connector installed successfully!'
            };
            
        } catch (error) {
            console.error('❌ Installation error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async registerConnector() {
        const params = {
            ID: this.connectorId,
            NAME: 'Custom WhatsApp (Baileys)',
            ICON: {
                // Using data URI for the icon
                DATA_IMAGE: this.getConnectorIcon()
            }
        };
        
        const result = await this.callBitrix24Method('imconnector.register', params);
        
        // Bitrix24 returns true on success
        if (result.result !== true) {
            throw new Error('Failed to register connector: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async bindPlacement() {
        const params = {
            PLACEMENT: 'CONTACT_CENTER',
            HANDLER: `${this.baseUrl}/app/widget`,
            TITLE: 'Custom WhatsApp',
            DESCRIPTION: 'Manage your custom WhatsApp connection'
        };
        
        const result = await this.callBitrix24Method('placement.bind', params);
        
        if (!result.result) {
            throw new Error('Failed to bind placement: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${method}`;
        
        console.log(`🔗 Calling Bitrix24 API: ${url}`);
        
        const data = {
            ...params,
            auth: this.accessToken
        };
        
        try {
            const response = await axios.post(url, querystring.stringify(data), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            console.log(`📡 Response code: ${response.status}`);
            console.log(`📄 Response Data:`, JSON.stringify(response.data).substring(0, 200) + '...');
            
            return response.data;
            
        } catch (error) {
            console.error('API Call Error:', error.response?.data || error.message);
            throw new Error(`HTTP Error calling Bitrix24: ${error.response?.status || 'Network Error'}`);
        }
    }

    getConnectorIcon() {
        // Simple 1x1 pixel transparent PNG, base64 encoded
        return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }
}

module.exports = CustomChannelApp;
