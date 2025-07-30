// lib/customChannelApp.js - Open Lines Approach (Based on Bitrix24 Documentation)
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
        
        // Open Lines configuration
        this.openLineConfig = {
            name: 'WhatsApp Support',
            shortDescription: 'WhatsApp customer support channel',
            avatar: '', // You can add an avatar URL here
            welcomeMessage: 'Thank you for contacting us via WhatsApp! We will be happy to help you. 😊'
        };
        
        console.log(`🏗️ CustomChannelApp initialized for domain: ${this.bitrix24Domain}`);
    }

    async install() {
        console.log('📦 Starting Open Lines installation process...');
        
        try {
            // Step 1: Test basic API connectivity
            console.log('1️⃣ Testing API connectivity...');
            const userResult = await this.callBitrix24Method('user.current');
            if (!userResult || !userResult.result) {
                throw new Error('Cannot connect to Bitrix24 API - check domain and access token');
            }
            console.log('✅ API connectivity confirmed - User:', userResult.result.NAME);

            // Step 2: Check Open Lines availability
            console.log('2️⃣ Checking Open Lines methods availability...');
            const openLinesMethods = await this.checkOpenLinesMethods();

            // Step 3: Try to get existing Open Lines
            console.log('3️⃣ Checking existing Open Lines...');
            const existingLines = await this.getExistingOpenLines();

            // Step 4: Create or find WhatsApp Open Line
            console.log('4️⃣ Setting up WhatsApp Open Line...');
            const openLineResult = await this.setupWhatsAppOpenLine();

            // Step 5: Set up webhooks for Open Lines
            console.log('5️⃣ Setting up Open Lines webhooks...');
            const webhookResults = await this.setupOpenLinesWebhooks();

            // Step 6: Test the setup
            console.log('6️⃣ Testing Open Lines setup...');
            const testResult = await this.testOpenLinesSetup();

            return {
                success: true,
                message: 'Open Lines installation completed successfully',
                domain: this.bitrix24Domain,
                setup: {
                    api_connectivity: true,
                    openlines_methods: openLinesMethods,
                    existing_lines: existingLines,
                    openline_setup: openLineResult,
                    webhooks: webhookResults,
                    test_result: testResult
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

    async checkOpenLinesMethods() {
        console.log('🔍 Checking available Open Lines methods...');
        
        try {
            const methodsResult = await this.callBitrix24Method('methods');
            if (methodsResult && methodsResult.result) {
                const openLinesMethods = methodsResult.result.filter(method => 
                    method.startsWith('imopenlines')
                );
                
                console.log('📋 Available Open Lines methods:', openLinesMethods);
                
                // Check for specific methods we need
                const requiredMethods = [
                    'imopenlines.config.list',
                    'imopenlines.network.join',
                    'imopenlines.network.message.add'
                ];
                
                const availableMethods = requiredMethods.filter(method => 
                    openLinesMethods.includes(method)
                );
                
                console.log('✅ Required methods available:', availableMethods);
                
                return {
                    total: openLinesMethods.length,
                    available: openLinesMethods,
                    required_available: availableMethods
                };
            }
        } catch (error) {
            console.log('⚠️ Could not fetch methods list:', error.message);
            return { error: error.message };
        }
    }

    async getExistingOpenLines() {
        console.log('📋 Getting existing Open Lines...');
        
        try {
            const result = await this.callBitrix24Method('imopenlines.config.list');
            
            if (result && result.result) {
                console.log(`✅ Found ${result.result.length} existing Open Lines`);
                
                // Look for existing WhatsApp line
                const whatsappLine = result.result.find(line => 
                    line.LINE_NAME && line.LINE_NAME.toLowerCase().includes('whatsapp')
                );
                
                if (whatsappLine) {
                    console.log('🎯 Found existing WhatsApp Open Line:', whatsappLine.CONFIG_ID);
                    this.existingWhatsAppLineId = whatsappLine.CONFIG_ID;
                }
                
                return result.result;
            }
        } catch (error) {
            console.log('⚠️ Could not get existing Open Lines:', error.message);
            return { error: error.message };
        }
        
        return [];
    }

    async setupWhatsAppOpenLine() {
        console.log('🔧 Setting up WhatsApp Open Line...');
        
        if (this.existingWhatsAppLineId) {
            console.log('✅ Using existing WhatsApp Open Line:', this.existingWhatsAppLineId);
            return { existing: true, id: this.existingWhatsAppLineId };
        }
        
        try {
            // Try to create a new Open Line configuration
            const createResult = await this.callBitrix24Method('imopenlines.config.add', {
                CONFIG: {
                    LINE_NAME: this.openLineConfig.name,
                    CRM_CREATE: 'lead', // or 'contact'
                    CRM_CREATE_THIRD: 'none',
                    WELCOME_MESSAGE: this.openLineConfig.welcomeMessage,
                    NO_ANSWER_RULE: 'queue',
                    QUEUE_TYPE: 'evenly',
                    CHECK_AVAILABLE: 'Y'
                }
            });
            
            if (createResult && createResult.result) {
                console.log('✅ Created new Open Line:', createResult.result);
                this.whatsappLineId = createResult.result;
                return { created: true, id: createResult.result };
            }
            
        } catch (error) {
            console.log('⚠️ Could not create Open Line via config.add:', error.message);
        }
        
        // Fallback: Use default Open Line or manual setup
        console.log('📝 Open Line setup requires manual configuration in Bitrix24');
        return { 
            manual_setup_required: true,
            instructions: 'Please manually create an Open Line in Bitrix24 Contact Center for WhatsApp'
        };
    }

    async setupOpenLinesWebhooks() {
        console.log('🎯 Setting up Open Lines webhooks...');
        
        const events = [
            'OnImOpenLineMessageAdd',      // New message in Open Line
            'OnImOpenLineSessionStart',    // New session started
            'OnImOpenLineSessionFinish',   // Session finished
            'OnCrmLeadAdd',               // New lead created
            'OnCrmContactAdd'             // New contact created
        ];
        
        const results = [];
        
        for (const event of events) {
            try {
                const result = await this.callBitrix24Method('event.bind', {
                    EVENT: event,
                    HANDLER: `${this.baseUrl}/webhook`,
                    AUTH_TYPE: 0  // Use app authentication
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

    async testOpenLinesSetup() {
        console.log('🧪 Testing Open Lines setup...');
        
        try {
            // Test 1: Try to join network (simulate user joining)
            console.log('Test 1: Network join simulation...');
            const joinResult = await this.simulateNetworkJoin('test_whatsapp_user');
            
            // Test 2: Try to send a test message
            console.log('Test 2: Test message sending...');
            const messageResult = await this.sendTestMessage('test_whatsapp_user', 'Test message from WhatsApp connector');
            
            // Test 3: Check CRM permissions
            console.log('Test 3: CRM permissions check...');
            const crmResult = await this.testCRMAccess();
            
            return {
                network_join: joinResult,
                message_send: messageResult,
                crm_access: crmResult
            };
            
        } catch (error) {
            console.log('❌ Testing failed:', error.message);
            return { error: error.message };
        }
    }

    // Core Open Lines methods for WhatsApp integration
    async simulateNetworkJoin(userCode) {
        try {
            const result = await this.callBitrix24Method('imopenlines.network.join', {
                CODE: userCode  // This would be the WhatsApp user ID
            });
            
            if (result && result.result) {
                console.log('✅ Network join successful:', result.result);
                return { success: true, result: result.result };
            }
            
            return { success: false, result };
            
        } catch (error) {
            console.log('❌ Network join failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async sendTestMessage(userCode, message) {
        try {
            // Method 1: Try imopenlines.network.message.add
            try {
                const result = await this.callBitrix24Method('imopenlines.network.message.add', {
                    USER_CODE: userCode,
                    MESSAGE: message,
                    SYSTEM: 'N'
                });
                
                if (result && result.result) {
                    console.log('✅ Message sent via network.message.add:', result.result);
                    return { success: true, method: 'network.message.add', result: result.result };
                }
            } catch (error) {
                console.log('⚠️ network.message.add failed:', error.message);
            }
            
            // Method 2: Try imopenlines.chat.add (alternative)
            try {
                const result = await this.callBitrix24Method('imopenlines.chat.add', {
                    USER_CODE: userCode,
                    LINE_NAME: 'WhatsApp',
                    USER_NAME: 'WhatsApp User',
                    MESSAGE: message
                });
                
                if (result && result.result) {
                    console.log('✅ Message sent via chat.add:', result.result);
                    return { success: true, method: 'chat.add', result: result.result };
                }
            } catch (error) {
                console.log('⚠️ chat.add failed:', error.message);
            }
            
            return { success: false, error: 'All message methods failed' };
            
        } catch (error) {
            console.log('❌ Send test message failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async testCRMAccess() {
        try {
            // Test basic CRM access
            const contactResult = await this.callBitrix24Method('crm.contact.list', {
                select: ['ID', 'NAME'],
                start: 0,
                order: { ID: 'DESC' }
            });
            
            if (contactResult && contactResult.result) {
                console.log('✅ CRM access confirmed');
                return { success: true, contacts_count: contactResult.result.length };
            }
            
            return { success: false, error: 'No CRM access' };
            
        } catch (error) {
            console.log('❌ CRM access test failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Main method for handling incoming WhatsApp messages
    async handleWhatsAppMessage(whatsappUserId, message, userName = 'WhatsApp User') {
        console.log(`📨 Handling WhatsApp message from ${whatsappUserId}: ${message.substring(0, 100)}...`);
        
        try {
            // Step 1: Join the user to the network (if not already joined)
            await this.simulateNetworkJoin(whatsappUserId);
            
            // Step 2: Send the message to Open Lines
            const messageResult = await this.sendTestMessage(whatsappUserId, message);
            
            if (messageResult.success) {
                console.log('✅ WhatsApp message successfully sent to Bitrix24');
                return { success: true, result: messageResult };
            }
            
            // Step 3: Fallback - create CRM activity
            const crmResult = await this.createCRMActivity(whatsappUserId, message, userName);
            
            return { success: true, fallback: true, result: crmResult };
            
        } catch (error) {
            console.error('❌ Error handling WhatsApp message:', error);
            return { success: false, error: error.message };
        }
    }

    async createCRMActivity(whatsappUserId, message, userName) {
        try {
            const result = await this.callBitrix24Method('crm.activity.add', {
                fields: {
                    OWNER_TYPE_ID: 1, // Lead
                    OWNER_ID: 1,      // You might want to create/find the actual lead/contact
                    TYPE_ID: 4,       // Call
                    SUBJECT: `WhatsApp Message from ${userName}`,
                    DESCRIPTION: `WhatsApp User: ${whatsappUserId}\nMessage: ${message}`,
                    COMPLETED: 'N',
                    PRIORITY: 2,
                    RESPONSIBLE_ID: 1
                }
            });
            
            return result;
        } catch (error) {
            console.error('❌ Error creating CRM activity:', error);
            throw error;
        }
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
                throw new Error(`Bitrix24 API error: HTTP ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
            return response.data;
            
        } catch (error) {
            if (error.response) {
                const errorMsg = error.response.data ? 
                    JSON.stringify(error.response.data) : 
                    `HTTP ${error.response.status}`;
                throw new Error(`Bitrix24 API error: ${errorMsg}`);
            }
            throw error;
        }
    }
}

module.exports = CustomChannelApp;
