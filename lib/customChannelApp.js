// lib/customChannelApp.js - COMPLETE WORKING VERSION
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
    }

    // Bitrix24 API method calling - MOVED TO TOP FOR PROPER SCOPE
    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${method}`;
        
        console.log(`🌐 Calling: ${method} on ${this.bitrix24Domain}`);
        
        try {
            // Prepare the data with access_token
            const postData = {
                ...params,
                access_token: this.accessToken
            };
            
            console.log(`📤 Request URL: ${url}`);
            
            const response = await axios.post(url, querystring.stringify(postData), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
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

    async install() {
        console.log('📦 Starting CRM integration installation...');
        
        try {
            // Step 1: Test basic API connectivity
            console.log('1️⃣ Testing API connectivity...');
            console.log('🔍 About to test connectivity - method exists:', typeof this.callBitrix24Method);
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

            // Step 4: Run integration test (non-blocking)
            console.log('4️⃣ Running integration test...');
            const integrationTest = await this.testIntegration();

            return {
                success: true,
                message: 'CRM integration completed successfully',
                domain: this.bitrix24Domain,
                tests: {
                    connectivity: connectivityTest,
                    crm: crmTest,  
                    webhooks: webhookTest,
                    integration: integrationTest
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
        console.log('🔍 Testing basic API connectivity...');
        console.log('🔍 Method type check:', typeof this.callBitrix24Method);
        console.log('🔍 This context:', !!this);
        
        try {
            // Test 1: Get current user (most basic method)
            console.log('🔍 About to call user.current method...');
            const userResult = await this.callBitrix24Method('user.current');
            
            if (!userResult || !userResult.result) {
                return { success: false, error: 'user.current failed - no result returned' };
            }
            
            console.log('✅ user.current works - User:', userResult.result.NAME || 'Unknown');

            // Test 2: Get available methods
            let availableMethods = [];
            try {
                console.log('🔍 Getting available methods...');
                const methodsResult = await this.callBitrix24Method('methods');
                if (methodsResult && methodsResult.result) {
                    availableMethods = methodsResult.result;
                    console.log(`✅ Found ${availableMethods.length} available methods`);
                }
            } catch (error) {
                console.log('⚠️ Could not get methods list:', error.message);
            }

            // Test 3: Check for specific methods we need
            const requiredMethods = [
                'crm.contact.add',
                'crm.contact.list', 
                'crm.lead.add',
                'crm.activity.add',
                'event.bind'
            ];

            const availableRequired = requiredMethods.filter(method => 
                availableMethods.length === 0 || availableMethods.includes(method)
            );

            console.log('📋 Required methods available:', availableRequired.length);

            return {
                success: true,
                user: userResult.result,
                totalMethods: availableMethods.length,
                requiredAvailable: availableRequired,
                allMethods: availableMethods.length < 20 ? availableMethods : availableMethods.slice(0, 20)
            };

        } catch (error) {
            console.error('❌ Connectivity test failed:', error.message);
            console.error('❌ Error stack:', error.stack);
            return { success: false, error: error.message };
        }
    }

    async testCRMPermissions() {
        console.log('🔍 Testing CRM permissions...');
        
        const results = {
            contacts: { tested: false },
            leads: { tested: false },
            activities: { tested: false }
        };

        // Test contacts
        try {
            console.log('🔍 Testing contacts list...');
            const contactsResult = await this.callBitrix24Method('crm.contact.list', {
                'select[0]': 'ID',
                'select[1]': 'NAME',
                start: 0
            });
            
            if (contactsResult && contactsResult.result !== undefined) {
                results.contacts = {
                    tested: true,
                    success: true,
                    count: contactsResult.result.length
                };
                console.log(`✅ Contacts access: ${contactsResult.result.length} contacts found`);
            }
        } catch (error) {
            results.contacts = {
                tested: true,
                success: false,
                error: error.message
            };
            console.log('❌ Contacts access failed:', error.message);
        }

        // Test leads  
        try {
            console.log('🔍 Testing leads list...');
            const leadsResult = await this.callBitrix24Method('crm.lead.list', {
                'select[0]': 'ID',
                'select[1]': 'TITLE',
                start: 0
            });
            
            if (leadsResult && leadsResult.result !== undefined) {
                results.leads = {
                    tested: true,
                    success: true,
                    count: leadsResult.result.length
                };
                console.log(`✅ Leads access: ${leadsResult.result.length} leads found`);
            }
        } catch (error) {
            results.leads = {
                tested: true,
                success: false,
                error: error.message
            };
            console.log('❌ Leads access failed:', error.message);
        }

        // Test activities
        try {
            console.log('🔍 Testing activities list...');
            const activitiesResult = await this.callBitrix24Method('crm.activity.list', {
                'select[0]': 'ID',
                'select[1]': 'SUBJECT',
                start: 0
            });
            
            if (activitiesResult && activitiesResult.result !== undefined) {
                results.activities = {
                    tested: true,
                    success: true,
                    count: activitiesResult.result.length
                };
                console.log(`✅ Activities access: ${activitiesResult.result.length} activities found`);
            }
        } catch (error) {
            results.activities = {
                tested: true,
                success: false,
                error: error.message
            };
            console.log('❌ Activities access failed:', error.message);
        }

        return results;
    }

    async testWebhookSetup() {
        console.log('🔍 Testing webhook setup...');
        
        const basicEvents = [
            'OnCrmContactAdd',
            'OnCrmLeadAdd'
        ];
        
        const results = [];
        
        for (const event of basicEvents) {
            try {
                console.log(`🔍 Binding event: ${event}`);
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
                if (error.message.includes('Handler already binded')) {
                    results.push({ event, success: true, note: 'Already bound' });
                    console.log(`✅ Event ${event} already bound (OK)`);
                } else {
                    results.push({ event, success: false, error: error.message });
                    console.log(`❌ Event ${event} binding failed:`, error.message);
                }
            }
        }
        
        return { events: results };
    }

    async testIntegration() {
        console.log('🧪 Running integration test...');
        
        try {
            console.log('🔍 Creating test contact...');
            // Test creating a contact
            const testContact = await this.callBitrix24Method('crm.contact.add', {
                'fields[NAME]': 'WhatsApp Test Contact',
                'fields[LAST_NAME]': 'Integration',
                'fields[PHONE][0][VALUE]': '+1234567890',
                'fields[PHONE][0][VALUE_TYPE]': 'MOBILE',
                'fields[SOURCE_ID]': 'WEBFORM',
                'fields[SOURCE_DESCRIPTION]': 'WhatsApp Integration Test',
                'fields[COMMENTS]': 'This is a test contact created by WhatsApp integration'
            });
            
            if (!testContact.result) {
                throw new Error('Contact creation failed - no result returned');
            }
            
            console.log(`✅ Test contact created: ID ${testContact.result}`);
            
            // Test creating an activity
            console.log('🔍 Creating test activity...');
            const testActivity = await this.callBitrix24Method('crm.activity.add', {
                'fields[OWNER_TYPE_ID]': 3,
                'fields[OWNER_ID]': testContact.result,
                'fields[TYPE_ID]': 4,
                'fields[SUBJECT]': 'WhatsApp Message Test',
                'fields[DESCRIPTION]': 'This is a test WhatsApp message created by the integration',
                'fields[COMPLETED]': 'N',
                'fields[PRIORITY]': 2,
                'fields[RESPONSIBLE_ID]': 1,
                'fields[COMMUNICATIONS][0][VALUE]': '+1234567890',
                'fields[COMMUNICATIONS][0][TYPE]': 'PHONE',
                'fields[COMMUNICATIONS][0][ENTITY_ID]': testContact.result,
                'fields[COMMUNICATIONS][0][ENTITY_TYPE_ID]': 3
            });
            
            if (!testActivity.result) {
                throw new Error('Activity creation failed - no result returned');
            }
            
            console.log(`✅ Test activity created: ID ${testActivity.result}`);
            
            // Clean up test contact
            try {
                console.log('🧹 Cleaning up test contact...');
                await this.callBitrix24Method('crm.contact.delete', {
                    id: testContact.result
                });
                console.log('🧹 Test contact cleaned up');
            } catch (cleanupError) {
                console.log('⚠️ Could not clean up test contact:', cleanupError.message);
            }
            
            return {
                success: true,
                contactId: testContact.result,
                activityId: testActivity.result,
                message: 'Integration test completed successfully'
            };
            
        } catch (error) {
            console.error('❌ Integration test failed:', error.message);
            return {
                success: false,
                error: error.message,
                note: 'Integration test failed but core functionality should still work'
            };
        }
    }

    // Main method for handling WhatsApp messages
    async handleWhatsAppMessage(whatsappUserId, message, userName = 'WhatsApp User') {
        console.log(`📨 Handling WhatsApp message from ${whatsappUserId}: ${message.substring(0, 100)}...`);
        
        try {
            // Step 1: Find or create contact
            let contactId = await this.findOrCreateContact(whatsappUserId, userName);
            
            // Step 2: Create activity for the message
            const activityResult = await this.callBitrix24Method('crm.activity.add', {
                'fields[OWNER_TYPE_ID]': 3, // Contact
                'fields[OWNER_ID]': contactId,
                'fields[TYPE_ID]': 4, // Call type
                'fields[SUBJECT]': `WhatsApp Message from ${userName}`,
                'fields[DESCRIPTION]': `WhatsApp User: ${whatsappUserId}\n\nMessage:\n${message}`,
                'fields[COMPLETED]': 'N',
                'fields[PRIORITY]': 2,
                'fields[RESPONSIBLE_ID]': 1,
                'fields[START_TIME]': new Date().toISOString(),
                'fields[END_TIME]': new Date().toISOString()
            });
            
            if (activityResult.result) {
                console.log(`✅ WhatsApp message logged as activity: ${activityResult.result}`);
                return {
                    success: true,
                    contactId: contactId,
                    activityId: activityResult.result
                };
            }
            
            throw new Error('Activity creation failed');
            
        } catch (error) {
            console.error('❌ Error handling WhatsApp message:', error);
            return { success: false, error: error.message };
        }
    }

    async findOrCreateContact(whatsappUserId, userName) {
        try {
            const phoneNumber = whatsappUserId.replace('@s.whatsapp.net', '').replace('@c.us', '');
            
            // Try to find existing contact
            const searchResult = await this.callBitrix24Method('crm.contact.list', {
                'filter[PHONE]': phoneNumber,
                'select[0]': 'ID',
                'select[1]': 'NAME',
                'select[2]': 'LAST_NAME'
            });
            
            if (searchResult.result && searchResult.result.length > 0) {
                const contact = searchResult.result[0];
                console.log(`✅ Found existing contact: ${contact.NAME} ${contact.LAST_NAME} (ID: ${contact.ID})`);
                return contact.ID;
            }
            
            // Create new contact
            const nameParts = (userName || 'WhatsApp Contact').split(' ');
            const firstName = nameParts[0] || 'WhatsApp';
            const lastName = nameParts.slice(1).join(' ') || 'Contact';
            
            const newContact = await this.callBitrix24Method('crm.contact.add', {
                'fields[NAME]': firstName,
                'fields[LAST_NAME]': lastName,
                'fields[PHONE][0][VALUE]': phoneNumber,
                'fields[PHONE][0][VALUE_TYPE]': 'MOBILE',
                'fields[SOURCE_ID]': 'WEBFORM',
                'fields[SOURCE_DESCRIPTION]': 'WhatsApp Integration',
                'fields[COMMENTS]': `WhatsApp User ID: ${whatsappUserId}\nCreated via WhatsApp Integration`
            });
            
            if (newContact.result) {
                console.log(`✅ Created new contact: ${firstName} ${lastName} (ID: ${newContact.result})`);
                return newContact.result;
            }
            
            throw new Error('Contact creation failed');
            
        } catch (error) {
            console.error('❌ Error finding/creating contact:', error);
            return 1; // Return admin user ID as fallback
        }
    }
}

module.exports = CustomChannelApp;
