// lib/customChannelApp.js (Fixed Version)
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
            // First, try to get the actual domain if we don't have it
            if (this.bitrix24Domain === 'unknown.bitrix24.com') {
                console.log('🔍 Attempting to detect actual domain...');
                await this.detectDomain();
            }
            
            // Step 1: Test basic API connectivity
            console.log('🔍 Testing API connectivity...');
            const appInfo = await this.callBitrix24Method('app.info');
            console.log('✅ API connectivity confirmed:', appInfo);
            
            // Step 2: Register the connector first
            let connectorResult = null;
            try {
                console.log('1️⃣ Registering connector...');
                connectorResult = await this.registerConnector();
                console.log('✅ Connector registered:', connectorResult);
            } catch (connectorError) {
                console.log('⚠️ Connector registration failed:', connectorError.message);
                // Continue with basic setup
            }

            // Step 3: Set connector data to make it visible
            let connectorDataResult = null;
            try {
                console.log('2️⃣ Setting connector data...');
                connectorDataResult = await this.setConnectorData();
                console.log('✅ Connector data set:', connectorDataResult);
            } catch (dataError) {
                console.log('⚠️ Connector data setting failed:', dataError.message);
            }

            // Step 4: Try to activate the connector
            let activationResult = null;
            try {
                console.log('3️⃣ Activating connector...');
                activationResult = await this.activateConnector();
                console.log('✅ Connector activated:', activationResult);
            } catch (activateError) {
                console.log('⚠️ Connector activation failed:', activateError.message);
            }

            // Step 5: Bind placement for UI access
            let placementResult = null;
            try {
                console.log('4️⃣ Binding placement...');
                placementResult = await this.bindPlacement();
                console.log('✅ Placement bound:', placementResult);
            } catch (placementError) {
                console.log('⚠️ Placement binding failed:', placementError.message);
                // Try alternative placement
                try {
                    placementResult = await this.bindAlternativePlacement();
                    console.log('✅ Alternative placement bound:', placementResult);
                } catch (altError) {
                    console.log('⚠️ Alternative placement also failed:', altError.message);
                }
            }

            // Step 6: Set up event handlers for integration
            let eventResult = null;
            try {
                console.log('5️⃣ Setting up event handlers...');
                eventResult = await this.setupEventHandlers();
                console.log('✅ Event handlers set up:', eventResult);
            } catch (eventError) {
                console.log('⚠️ Event handler setup failed:', eventError.message);
            }

            return {
                success: true,
                connector: connectorResult,
                connectorData: connectorDataResult,
                activation: activationResult,
                placement: placementResult,
                events: eventResult,
                message: 'Installation completed successfully',
                domain: this.bitrix24Domain,
                appInfo: appInfo
            };

        } catch (error) {
            console.error('❌ Installation failed:', error);
            
            return {
                success: false,
                error: error.message,
                message: 'Installation failed - please check configuration',
                domain: this.bitrix24Domain
            };
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

    async setConnectorData() {
        console.log('📊 Setting connector data for visibility...');
        
        const params = {
            ID: this.connectorId,
            DATA: {
                name: 'Custom WhatsApp',
                description: 'Connect WhatsApp Business to Bitrix24',
                icon_file: this.getConnectorIcon(),
                settings_url: `${this.baseUrl}/handler.js`,
                status: 'available',
                supported_features: {
                    'send_message': true,
                    'receive_message': true,
                    'delivery_status': true,
                    'read_status': true,
                    'file_upload': true
                }
            }
        };

        try {
            const result = await this.callBitrix24Method('imconnector.connector.data.set', params);
            
            if (result.error) {
                throw new Error(`Connector data setting failed: ${result.error_description || result.error}`);
            }

            return result;
        } catch (error) {
            console.error('❌ Connector data setting error:', error);
            throw error;
        }
    }

    async activateConnector() {
        console.log('⚡ Activating connector...');
        
        const params = {
            CONNECTOR: this.connectorId,
            ACTIVE: 'Y',
            DATA: {
                active: 'Y',
                name: 'Custom WhatsApp',
                settings: {
                    webhook_url: `${this.baseUrl}/webhook`,
                    handler_url: `${this.baseUrl}/handler.js`
                }
            }
        };

        try {
            const result = await this.callBitrix24Method('imconnector.activate', params);
            
            if (result.error) {
                throw new Error(`Connector activation failed: ${result.error_description || result.error}`);
            }

            return result;
        } catch (error) {
            console.error('❌ Connector activation error:', error);
            throw error;
        }
    }

    async bindPlacement() {
        console.log('🔗 Binding placement for UI access...');
        
        // Try the most common placement for messaging integrations
        const params = {
            PLACEMENT: 'IM_TEXTAREA_BUTTON',
            HANDLER: `${this.baseUrl}/handler.js`,
            TITLE: 'WhatsApp',
            DESCRIPTION: 'Connect WhatsApp Business',
            OPTIONS: {
                width: 800,
                height: 600,
                resizable: true
            }
        };
        
        try {
            const result = await this.callBitrix24Method('placement.bind', params);
            
            if (result.error) {
                throw new Error(`Placement binding failed: ${result.error_description || result.error}`);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Placement binding error:', error);
            throw error;
        }
    }

    async bindAlternativePlacement() {
        console.log('🔗 Trying alternative placement binding...');
        
        // Try CRM-related placements that are more likely to work
        const placements = [
            'CRM_LEAD_DETAIL_TAB',
            'CRM_CONTACT_DETAIL_TAB',
            'CRM_DEAL_DETAIL_TAB',
            'CRM_LEAD_LIST_MENU',
            'CRM_CONTACT_LIST_MENU',
            'IM_SIDEBAR'
        ];
        
        for (const placement of placements) {
            try {
                const params = {
                    PLACEMENT: placement,
                    HANDLER: `${this.baseUrl}/handler.js`,
                    TITLE: 'WhatsApp Connector',
                    DESCRIPTION: 'Manage WhatsApp connections',
                    OPTIONS: {
                        width: 800,
                        height: 600
                    }
                };
                
                const result = await this.callBitrix24Method('placement.bind', params);
                console.log(`✅ Placement ${placement} bound successfully:`, result);
                return result;
            } catch (error) {
                console.log(`❌ Placement ${placement} failed:`, error.message);
                continue;
            }
        }
        
        throw new Error('All alternative placement methods failed');
    }

    async setupEventHandlers() {
        console.log('🎯 Setting up event handlers...');
        
        const events = [
            'OnImMessageAdd',
            'OnCrmLeadAdd',
            'OnCrmContactAdd',
            'OnCrmDealAdd'
        ];
        
        const results = [];
        
        for (const event of events) {
            try {
                const result = await this.callBitrix24Method('event.bind', {
                    EVENT: event,
                    HANDLER: `${this.baseUrl}/webhook`,
                    AUTH_TYPE: 1
                });
                results.push({ event, result, success: true });
                console.log(`✅ Event ${event} bound:`, result);
            } catch (eventError) {
                console.log(`⚠️ Event ${event} binding failed:`, eventError.message);
                results.push({ event, error: eventError.message, success: false });
            }
        }
        
        return results;
    }

    async detectDomain() {
        console.log('🔍 Detecting Bitrix24 domain from access token...');
        
        try {
            // Try to call app.info to get domain information
            const result = await this.callBitrix24Method('app.info');
            
            if (result && result.result) {
                console.log('📋 App info received:', result.result);
            }
        } catch (error) {
            // If the API call fails, we might be able to extract domain from the error
            if (error.message && error.message.includes('https://')) {
                const domainMatch = error.message.match(/https:\/\/([^\/]+)/);
                if (domainMatch) {
                    this.bitrix24Domain = domainMatch[1];
                    console.log('✅ Domain extracted from error:', this.bitrix24Domain);
                    return;
                }
            }
            
            console.log('⚠️ Could not detect domain, will use generic approach');
        }
    }

    async callBitrix24Method(method, params = {}) {
        let url;
        
        if (this.bitrix24Domain === 'unknown.bitrix24.com') {
            // Try the generic Bitrix24 REST API endpoint first
            url = `https://rest.bitrix24.com/rest/${this.accessToken}/${method}.json`;
        } else {
            url = `https://${this.bitrix24Domain}/rest/${this.accessToken}/${method}.json`;
        }
        
        console.log(`🌐 Calling Bitrix24 method: ${method}`);
        console.log(`📡 URL: ${url}`);
        console.log(`📋 Params:`, JSON.stringify(params, null, 2));
        
        try {
            const response = await axios.post(url, querystring.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            
            console.log(`✅ Response for ${method}:`, response.data);
            
            // Update domain if we used generic endpoint successfully
            if (this.bitrix24Domain === 'unknown.bitrix24.com' && response.config && response.config.url) {
                const actualUrl = response.config.url || response.request?.responseURL;
                if (actualUrl) {
                    const domainMatch = actualUrl.match(/https:\/\/([^\/]+)/);
                    if (domainMatch && domainMatch[1] !== 'rest.bitrix24.com') {
                        this.bitrix24Domain = domainMatch[1];
                        console.log(`✅ Updated domain to: ${this.bitrix24Domain}`);
                    }
                }
            }
            
            return response.data;
            
        } catch (error) {
            console.error(`❌ Error calling ${method}:`, error.message);
            
            // Try alternative URL patterns if the main one failed
            if (this.bitrix24Domain === 'unknown.bitrix24.com' && url.includes('rest.bitrix24.com')) {
                console.log('🔄 Retrying with alternative endpoint structure...');
                
                const alternativeUrls = [
                    `https://oauth.bitrix.info/rest/${this.accessToken}/${method}.json`,
                    `https://bitrix24.com/rest/${this.accessToken}/${method}.json`
                ];
                
                for (const altUrl of alternativeUrls) {
                    try {
                        console.log(`🔄 Trying alternative URL: ${altUrl}`);
                        const altResponse = await axios.post(altUrl, querystring.stringify(params), {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            timeout: 15000
                        });
                        
                        console.log(`✅ Alternative URL worked for ${method}:`, altResponse.data);
                        return altResponse.data;
                        
                    } catch (altError) {
                        console.log(`❌ Alternative URL failed: ${altError.message}`);
                        continue;
                    }
                }
            }
            
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
        // Base64 encoded WhatsApp icon
        return `data:image/svg+xml;base64,${Buffer.from(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488"/>
            </svg>
        `).toString('base64')}`;
    }

    // Utility methods for managing the connector
    async checkConnectorStatus() {
        try {
            const result = await this.callBitrix24Method('imconnector.list');
            return result.result && result.result[this.connectorId];
        } catch (error) {
            console.log('Connector not found or error checking status:', error.message);
            return false;
        }
    }

    async unregisterConnector() {
        try {
            const result = await this.callBitrix24Method('imconnector.unregister', {
                ID: this.connectorId
            });
            console.log('✅ Connector unregistered:', result);
            return result;
        } catch (error) {
            console.log('⚠️ Connector unregistration failed (may not exist):', error.message);
            return null;
        }
    }

    async getConnectorSettings() {
        try {
            const result = await this.callBitrix24Method('imconnector.settings.get', {
                CONNECTOR: this.connectorId
            });
            return result.result;
        } catch (error) {
            console.error('❌ Failed to get connector settings:', error);
            return null;
        }
    }

    async updateConnectorSettings(settings) {
        try {
            const result = await this.callBitrix24Method('imconnector.settings.set', {
                CONNECTOR: this.connectorId,
                ...settings
            });
            return result.result;
        } catch (error) {
            console.error('❌ Failed to update connector settings:', error);
            throw error;
        }
    }

    // Method to send WhatsApp messages through Bitrix24
    async sendMessage(chatId, message, files = []) {
        try {
            const params = {
                CONNECTOR: this.connectorId,
                CHAT_ID: chatId,
                MESSAGE: message
            };

            if (files.length > 0) {
                params.FILES = files;
            }

            const result = await this.callBitrix24Method('imconnector.send.messages', params);
            return result;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    // Method to handle incoming WhatsApp messages
    async handleIncomingMessage(messageData) {
        try {
            const params = {
                CONNECTOR: this.connectorId,
                CHAT_ID: messageData.chatId,
                MESSAGE: messageData.message,
                USER_ID: messageData.userId,
                DATE_CREATE: new Date().toISOString(),
                EXTERNAL_MESSAGE_ID: messageData.messageId
            };

            const result = await this.callBitrix24Method('imconnector.send.messages', params);
            return result;
        } catch (error) {
            console.error('❌ Failed to handle incoming message:', error);
            throw error;
        }
    }
}

module.exports = CustomChannelApp;
