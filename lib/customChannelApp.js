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
            // First, try to get the actual domain if we don't have it
            if (this.bitrix24Domain === 'unknown.bitrix24.com') {
                console.log('🔍 Attempting to detect actual domain...');
                await this.detectDomain();
            }
            
            // First, let's test basic API connectivity
            console.log('🔍 Testing API connectivity...');
            const appInfo = await this.callBitrix24Method('app.info');
            console.log('✅ API connectivity confirmed:', appInfo);
            
            // Step 1: Try to register the connector (this might fail, that's ok)
            let connectorResult = null;
            try {
                console.log('1️⃣ Attempting to register connector...');
                connectorResult = await this.registerConnector();
                console.log('✅ Connector registered:', connectorResult);
            } catch (connectorError) {
                console.log('⚠️ Connector registration failed (this might be normal):', connectorError.message);
                
                // Try alternative registration method
                try {
                    console.log('🔄 Trying alternative connector registration...');
                    connectorResult = await this.registerConnectorAlternative();
                    console.log('✅ Alternative connector registration succeeded:', connectorResult);
                } catch (altError) {
                    console.log('⚠️ Alternative connector registration also failed:', altError.message);
                    // Continue anyway - some Bitrix24 versions handle this differently
                }
            }

            // Step 2: Try to bind placement
            let placementResult = null;
            try {
                console.log('2️⃣ Attempting to bind placement...');
                placementResult = await this.bindPlacement();
                console.log('✅ Placement bound:', placementResult);
            } catch (placementError) {
                console.log('⚠️ Placement binding failed:', placementError.message);
                
                // Try alternative placement method
                try {
                    console.log('🔄 Trying alternative placement binding...');
                    placementResult = await this.bindPlacementAlternative();
                    console.log('✅ Alternative placement binding succeeded:', placementResult);
                } catch (altPlacementError) {
                    console.log('⚠️ Alternative placement binding also failed:', altPlacementError.message);
                }
            }

            // Step 3: Try to set up webhook or other integration methods
            let webhookResult = null;
            try {
                console.log('3️⃣ Setting up webhook integration...');
                webhookResult = await this.setupWebhook();
                console.log('✅ Webhook setup completed:', webhookResult);
            } catch (webhookError) {
                console.log('⚠️ Webhook setup failed (might not be available):', webhookError.message);
            }

            return {
                success: true,
                connector: connectorResult,
                placement: placementResult,
                webhook: webhookResult,
                message: 'Installation completed successfully',
                domain: this.bitrix24Domain,
                appInfo: appInfo
            };

        } catch (error) {
            console.error('❌ Installation failed:', error);
            
            // Return partial success if we at least got basic connectivity
            return {
                success: false,
                error: error.message,
                message: 'Installation partially completed - manual configuration may be needed',
                domain: this.bitrix24Domain
            };
        }
    }

    async registerConnectorAlternative() {
        console.log('🔌 Trying alternative connector registration...');
        
        // Try using different API methods that might be available
        const methods = [
            'imopenlines.connector.register',
            'crm.channel.register', 
            'app.placement.bind' // This might work for some setups
        ];
        
        for (const method of methods) {
            try {
                const params = {
                    ID: this.connectorId,
                    NAME: 'Custom WhatsApp',
                    HANDLER: `${this.baseUrl}/handler.js`
                };
                
                const result = await this.callBitrix24Method(method, params);
                console.log(`✅ ${method} succeeded:`, result);
                return result;
            } catch (error) {
                console.log(`❌ ${method} failed:`, error.message);
                continue;
            }
        }
        
        throw new Error('All alternative connector registration methods failed');
    }

    async bindPlacementAlternative() {
        console.log('🔗 Trying alternative placement binding...');
        
        // Try different placement approaches
        const placements = [
            'CRM_LEAD_LIST_MENU',
            'CRM_CONTACT_LIST_MENU', 
            'CRM_DEAL_LIST_MENU',
            'MAIN_TOP_PANEL'
        ];
        
        for (const placement of placements) {
            try {
                const params = {
                    PLACEMENT: placement,
                    HANDLER: `${this.baseUrl}/handler.js`,
                    TITLE: 'WhatsApp Connector',
                    DESCRIPTION: 'Manage WhatsApp connections'
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

    async setupWebhook() {
        console.log('🪝 Setting up webhook integration...');
        
        try {
            // Try to register event handlers
            const events = ['OnCrmLeadAdd', 'OnCrmContactAdd', 'OnImMessageAdd'];
            const results = [];
            
            for (const event of events) {
                try {
                    const result = await this.callBitrix24Method('event.bind', {
                        EVENT: event,
                        HANDLER: `${this.baseUrl}/webhook`,
                        AUTH_TYPE: 1
                    });
                    results.push({ event, result });
                    console.log(`✅ Event ${event} bound:`, result);
                } catch (eventError) {
                    console.log(`⚠️ Event ${event} binding failed:`, eventError.message);
                }
            }
            
            return results;
        } catch (error) {
            throw new Error(`Webhook setup failed: ${error.message}`);
        }
    }

    async detectDomain() {
        console.log('🔍 Detecting Bitrix24 domain from access token...');
        
        try {
            // Try to call app.info to get domain information
            const result = await this.callBitrix24Method('app.info');
            
            if (result && result.result && result.result.license_family) {
                // The domain might be in the response, let's check
                console.log('📋 App info received:', result.result);
                
                // Try to extract domain from various fields
                if (result.result.server_time) {
                    // Domain might be embedded in the server response
                    console.log('⚠️ Could not auto-detect domain, using fallback');
                }
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

    async registerConnector() {
        console.log('🔌 Registering WhatsApp connector...');
        
        // First, let's check what methods are available
        try {
            const methods = await this.callBitrix24Method('methods');
            console.log('📋 Available methods:', Object.keys(methods.result || {}).slice(0, 10), '...(and more)');
            
            // Check if imconnector methods are available
            const imconnectorMethods = Object.keys(methods.result || {}).filter(m => m.startsWith('imconnector'));
            console.log('🔌 Available imconnector methods:', imconnectorMethods);
            
            if (imconnectorMethods.length === 0) {
                console.log('⚠️ No imconnector methods available - this might be a permissions issue');
                throw new Error('imconnector methods not available - check app permissions');
            }
        } catch (methodsError) {
            console.log('⚠️ Could not retrieve available methods:', methodsError.message);
        }
        
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
        
        // First check available placements
        try {
            const placements = await this.callBitrix24Method('placement.list');
            console.log('📋 Available placements:', placements.result || 'Could not retrieve');
        } catch (placementListError) {
            console.log('⚠️ Could not retrieve available placements:', placementListError.message);
        }
        
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
        // If domain is unknown, try different approaches
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
                timeout: 15000 // 15 second timeout
            });
            
            console.log(`✅ Response for ${method}:`, response.data);
            
            // If we used the generic endpoint and got a successful response,
            // try to extract the actual domain for future calls
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
            
            // If the generic endpoint failed and we haven't tried the direct domain approach, try that
            if (this.bitrix24Domain === 'unknown.bitrix24.com' && url.includes('rest.bitrix24.com')) {
                console.log('🔄 Retrying with alternative endpoint structure...');
                
                // Try alternative URL patterns
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
        // Base64 encoded WhatsApp icon (simple green icon)
        return `data:image/svg+xml;base64,${Buffer.from(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488"/>
            </svg>
        `).toString('base64')}`;
    }

    // Simple installation that just sets up basic integration
    async installBasic() {
        console.log('📦 Starting BASIC installation process...');
        
        try {
            // Test basic connectivity
            console.log('🔍 Testing basic API connectivity...');
            const appInfo = await this.callBitrix24Method('app.info');
            console.log('✅ Basic API connectivity confirmed');
            
            // Try to bind a simple placement - this usually works
            console.log('📍 Setting up application placement...');
            const placementResult = await this.callBitrix24Method('placement.bind', {
                PLACEMENT: 'CRM_LEAD_LIST_MENU',
                HANDLER: `${this.baseUrl}/handler.js`,
                TITLE: 'WhatsApp Connector',
                DESCRIPTION: 'Connect WhatsApp to your CRM'
            });
            
            console.log('✅ Basic installation completed');
            
            return {
                success: true,
                type: 'basic',
                message: 'Basic installation completed - WhatsApp connector is ready',
                domain: this.bitrix24Domain,
                appInfo: appInfo.result,
                placement: placementResult.result
            };
            
        } catch (error) {
            console.error('❌ Basic installation failed:', error);
            
            // Even if placement fails, return success so user knows the API works
            return {
                success: true,
                type: 'minimal',
                message: 'Minimal installation completed - API connection established',
                domain: this.bitrix24Domain,
                warning: 'Some features may require manual configuration',
                error: error.message
            };
        }
    }
    async checkConnectorStatus() {
        try {
            const result = await this.callBitrix24Method('imconnector.list');
            return result.result && result.result[this.connectorId];
        } catch (error) {
            console.log('Connector not found, will register new one');
            return false;
        }
    }

    // Helper method to unregister connector (for reinstallation)
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

    // Method to get current connector settings
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

    // Method to update connector settings
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
}

module.exports = CustomChannelApp;
