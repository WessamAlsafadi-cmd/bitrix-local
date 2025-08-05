const axios = require('axios');
const querystring = require('querystring');

class CustomChannelApp {
    constructor(domain, accessToken) {
        if (!domain || !accessToken) {
            throw new Error('CustomChannelApp requires a domain and access token.');
        }
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.baseUrl = process.env.BASE_URL || 'https://your-render-app-name.onrender.com';
        
        console.log(`🏗️ CustomChannelApp initialized for domain: ${this.bitrix24Domain}`);
        
        // Bind methods to ensure 'this' context is preserved
        this.callBitrix24Method = this.callBitrix24Method.bind(this);
        this.testConnectivity = this.testConnectivity.bind(this);
        this.testCRMPermissions = this.testCRMPermissions.bind(this);
        this.testWebhookSetup = this.testWebhookSetup.bind(this);
        this.testIntegration = this.testIntegration.bind(this);
        this.setupPlacements = this.setupPlacements.bind(this);
    }

    // Bitrix24 API method calling
    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${method}`;
        
        console.log(`🌐 Calling: ${method} on ${this.bitrix24Domain}`);
        
        try {
            const postData = {
                ...params,
                access_token: this.accessToken
            };
            
            console.log(`📤 Request URL: ${url}`);
            
            const response = await axios.post(url, postData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            console.log(`📊 ${method} response status:`, response.status);
            
            if (response.data && response.data.error) {
                const errorDescription = response.data.error_description || response.data.error;
                throw new Error(`Bitrix24 API error: ${response.data.error} - ${errorDescription}`);
            }
            
            return response.data;
            
        } catch (error) {
            if (error.response) {
                const errorMsg = error.response.data ? 
                    JSON.stringify(error.response.data) : 
                    `HTTP ${error.response.status}`;
                console.error(`❌ API Error for ${method}:`, errorMsg);
                throw new Error(`Bitrix24 API error: ${errorMsg}`);
            }
            console.error(`❌ Network/Other Error for ${method}:`, error.message);
            throw error;
        }
    }

    // Setup placements for the app
    async setupPlacements() {
        console.log('🎯 Setting up Bitrix24 placements...');
        
        const placements = [
            {
                placement: 'CRM_CONTACT_LIST_MENU',
                handler: `${this.baseUrl}/app`,
                title: 'Embark Messenger',
            },
            {
                placement: 'CRM_LEAD_LIST_MENU', 
                handler: `${this.baseUrl}/app`,
                title: 'Embark Messenger',
            },
            {
                placement: 'CRM_CONTACT_DETAIL_TAB',
                handler: `${this.baseUrl}/app`,
                title: 'Embark Messenger',
            },
            {
                placement: 'CRM_LEAD_DETAIL_TAB',
                handler: `${this.baseUrl}/app`, 
                title: 'Embark Messenger',
            },
            {
                placement: 'CRM_DEAL_DETAIL_TAB',
                handler: `${this.baseUrl}/app`,
                title: 'Embark Messenger',
            },
            {
                placement: 'LEFT_MENU',
                handler: `${this.baseUrl}/app`,
                title: 'Embark Messenger',
            }
        ];

        const results = [];
        
        for (const p of placements) {
            try {
                console.log(`📍 Binding placement: ${p.placement}`);
                const result = await this.callBitrix24Method('placement.bind', {
                    PLACEMENT: p.placement,
                    HANDLER: p.handler,
                    TITLE: p.title
                });
                
                if (result && result.result) {
                    results.push({ placement: p.placement, success: true });
                    console.log(`✅ Placement ${p.placement} installed successfully.`);
                } else {
                    results.push({ placement: p.placement, success: false, error: 'Bind command did not return a successful result.' });
                    console.error(`❌ Placement ${p.placement} failed on bind.`);
                }
            } catch (error) {
                results.push({ placement: p.placement, success: false, error: error.message });
                console.error(`❌ A critical error occurred for placement ${p.placement}:`, error.message);
            }
        }
        
        return { placements: results };
    }

    // Install method including placement setup
    async install() {
        console.log('📦 Starting CRM integration installation...');
        
        try {
            // Step 1: Test basic API connectivity
            console.log('1️⃣ Testing API connectivity...');
            const connectivityTest = await this.testConnectivity();
            if (!connectivityTest.success) {
                throw new Error('API connectivity test failed: ' + connectivityTest.error);
            }

            // Step 2: Test CRM permissions
            console.log('2️⃣ Testing CRM permissions...');
            const crmTest = await this.testCRMPermissions();

            // Step 3: Test webhook setup
            console.log('3️⃣ Testing webhook setup...');
            const webhookTest = await this.testWebhookSetup();

            // Step 4: Setup placements
            console.log('4️⃣ Setting up Bitrix24 placements...');
            const placementTest = await this.setupPlacements();

            return {
                success: true,
                message: 'CRM integration completed successfully - App should now appear in Bitrix24 interface',
                domain: this.bitrix24Domain,
                tests: {
                    connectivity: connectivityTest,
                    crm: crmTest,  
                    webhooks: webhookTest,
                    placements: placementTest
                }
            };

        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            console.error('❌ Stack trace:', error.stack);
            return {
                success: false,
                error: error.message,
                message: 'Installation failed - check logs for details',
                domain: this.bitrix24Domain
            };
        }
    }

    async testConnectivity() {
        try {
            const response = await this.callBitrix24Method('profile');
            return { success: true, data: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testCRMPermissions() {
        try {
            const response = await this.callBitrix24Method('crm.lead.list', { select: ['ID', 'TITLE'] });
            return { success: true, data: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testWebhookSetup() {
        try {
            const response = await this.callBitrix24Method('event.bind', {
                event: 'OnImMessageAdd',
                handler: `${this.baseUrl}/webhook`
            });
            return { success: true, data: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testIntegration() {
        try {
            const leadResponse = await this.callBitrix24Method('crm.lead.add', {
                fields: {
                    TITLE: 'Test Lead from WhatsApp Connector',
                    SOURCE_ID: 'WEB'
                }
            });
            return { success: true, leadId: leadResponse.result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = CustomChannelApp;
