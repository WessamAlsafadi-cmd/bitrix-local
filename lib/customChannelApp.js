// lib/customChannelApp.js (Complete Fixed Version)
const axios = require('axios');
const querystring = require('querystring');

class CustomChannelApp {
    constructor(domain, accessToken) {
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.connectorId = 'custom_whatsapp';
        this.baseUrl = process.env.BASE_URL || 'https://your-render-app-name.onrender.com';
        
        console.log('🏗️ CustomChannelApp initialized for domain:', domain);
    }

    async install() {
        console.log('📦 Starting installation process...');
        
        try {
            // Step 1: Register the connector
            console.log('1️⃣ Registering connector...');
            const connectorResult = await this.registerConnector();
            console.log('✅ Connector registered:', connectorResult);

            // Step 2: Bind placement
            console.log('2️⃣ Binding placement...');
            const placementResult = await this.bindPlacement();
            console.log('✅ Placement bound:', placementResult);

            return {
                success: true,
                connector: connectorResult,
                placement: placementResult,
                message: 'Installation completed successfully'
            };

        } catch (error) {
            console.error('❌ Installation failed:', error);
            throw error;
        }
    }

    async registerConnector() {
        console.log('🔌 Registering WhatsApp connector...');
        
        const params = {
            ID: this.connectorId,
            NAME: 'Custom WhatsApp',
            ICON_FILE: this.getConnectorIcon(),
            COMPONENT: 'CustomWhatsAppConnector',
            PLACEMENT_HANDLER: `${this.baseUrl}/handler.js`,
            SETTINGS_SUPPORTED: 'Y',
            NEWSLETTER_SUPPORTED: 'N',
            DEL_EXTERNAL_MESSAGES: 'Y',
            EXTERNAL_BX_ID_SUPPORTED: 'Y',
            DELIVERY_STATUS_SUPPORTED: 'Y'
        };

        try {
            const result = await this.callBitrix24Method('imconnector.register', params);
            
            if (result.error) {
                throw new Error(`Connector registration failed: ${result.error_description || result.error}`);
            }

            return result;
        } catch (error) {
            console.error('❌ Connector registration error:', error);
            throw error;
        }
    }

    async bindPlacement() {
        console.log('🔗 Binding placement to the correct /handler.js endpoint...');
        
        const params = {
            PLACEMENT: 'CONTACT_CENTER',
            HANDLER: `${this.baseUrl}/handler.js`,
            TITLE: 'Custom WhatsApp',
            DESCRIPTION: 'Manage your custom WhatsApp connection',
            OPTIONS: {
                width: 800,
                height: 600
            }
        };
        
        try {
            const result = await this.callBitrix24Method('placement.bind', params);
            
            if (result.error) {
                throw new Error(`Placement binding failed: ${result.error_description || result.error}`);
            }
            
            if (!result.result) {
                throw new Error('Failed to bind placement: ' + JSON.stringify(result));
            }
            
            return result;
        } catch (error) {
            console.error('❌ Placement binding error:', error);
            throw error;
        }
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${this.accessToken}/${method}.json`;
        
        console.log(`🌐 Calling Bitrix24 method: ${method}`);
        console.log(`📡 URL: ${url}`);
        console.log(`📋 Params:`, JSON.stringify(params, null, 2));
        
        try {
            const response = await axios.post(url, querystring.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000 // 15 second timeout
            });
            
            console.log(`✅ Response for ${method}:`, response.data);
            return response.data;
            
        } catch (error) {
            console.error(`❌ Error calling ${method}:`, error.message);
            
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                throw new Error(`Bitrix24 API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                console.error('No response received:', error.request);
                throw new Error('No response from Bitrix24 API');
            } else {
                throw new Error(`Request setup error: ${error.message}`);
            }
        }
    }

    getConnectorIcon() {
        // Base64 encoded WhatsApp icon (simple green icon)
        return `data:image/svg+xml;base64,${Buffer.from(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13
