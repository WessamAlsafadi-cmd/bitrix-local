// lib/customChannelApp.js - Minimal Version (Basic CRM Methods Only)
const axios = require('axios');
const querystring = require('querystring');

class customChannelApp {
    constructor(domain, accessToken) {
        if (!domain || !accessToken) {
            throw new Error('customChannelApp requires a domain and access token.');
        }
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.baseUrl = process.env.BASE_URL || 'https://your-render-app-name.onrender.com';
        
        console.log(`🏗️ customChannelApp initialized for domain: ${this.bitrix24Domain}`);
    }

    async install() {
        console.log('📦 Starting minimal CRM-only installation...');
        
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

            // Step 4: Run final integration test
            console.log('4️⃣ Running integration test...');
            const integrationTest = await this.testIntegration();

            return {
                success: true,
                message: 'Basic CRM integration completed successfully',
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
        
        try {
            // Test 1: Get current user (most basic method)
            const userResult = await this.callBitrix24Method('user.current');
            if (!userResult || !userResult.result) {
                return { success: false, error: 'user.current failed' };
            }
            
            console.log('✅ user.current works - User:', userResult.result.NAME);

            // Test 2: Get available methods
            let availableMethods = [];
            try {
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

            console.log('📋 Required methods check:', availableRequired);

            return {
                success: true,
                user: userResult.result,
                totalMethods: availableMethods.length,
                requiredAvailable: availableRequired,
                allMethods: availableMethods.length < 20 ? availableMethods : availableMethods.slice(0, 20)
            };

        } catch (error) {
            console.error('❌ Connectivity test failed:', error.message);
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
            const contactsResult = await this.callBitrix24Method('crm.contact.list', {
                select: ['ID', 'NAME'],
                start: 0,
                filter: {}
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
            const leadsResult = await this.callBitrix24Method('crm.lead.list', {
                select: ['ID', 'TITLE'],
                start: 0,
                filter: {}
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
            const activitiesResult = await this.callBitrix24Method('crm.activity.list', {
                select: ['ID', 'SUBJECT'],
                start: 0,
                filter: {}
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
        
        // Only test basic events that should be available everywhere
        const basicEvents = [
            'OnCrmContactAdd',
            'OnCrmLeadAdd'
        ];
        
        const results = [];
        
        for (const event of basicEvents) {
            try {
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
        
        return { events: results };
    }

    async testIntegration() {
        console.log('🧪 Running integration test...');
        
        try {
            // Test creating a contact (this simulates WhatsApp user)
            const testContact = await this.callBitrix24Method('crm.contact.add', {
                fields: {
                    'NAME': 'WhatsApp Test Contact',
                    'PHONE': [{ 'VALUE': '+1234567890', 'VALUE_TYPE': 'MOBILE' }],
                    'SOURCE_ID': 'WEBFORM',
                    'SOURCE_DESCRIPTION': 'WhatsApp Integration Test',
                    'COMMENTS': 'This is a test contact created by WhatsApp integration'
                }
            });
            
            if (!testContact.result) {
                throw new Error('Contact creation failed');
            }
            
            console.log(`✅ Test contact created: ID ${testContact.result}`);
            
            // Test creating an activity (this simulates a WhatsApp message)
            const testActivity = await this.callBitrix24Method('crm.activity.add', {
                fields: {
                    'OWNER_TYPE_ID': 3, // Contact
                    'OWNER_ID': testContact.result,
                    'TYPE_ID': 4, // Call
                    'SUBJECT': 'WhatsApp Message Test',
                    'DESCRIPTION': 'This is a test WhatsApp message created by the integration',
                    'COMPLETED': 'N',
                    'PRIORITY': 2,
                    'RESPONSIBLE_ID': 1
                }
            });
            
            if (!testActivity.result) {
                throw new Error('Activity creation failed');
            }
            
            console.log(`✅ Test activity created: ID ${testActivity.result}`);
            
            // Clean up test contact
            try {
                await this.callBitrix24Method('crm.contact.delete', {
                    ID: testContact.result
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
                error: error.message
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
                fields: {
                    'OWNER_TYPE_ID': 3, // Contact
                    'OWNER_ID': contactId,
                    'TYPE_ID': 4, // Call type (you can change this)
                    'SUBJECT': `WhatsApp Message from ${userName}`,
                    'DESCRIPTION': `WhatsApp User: ${whatsappUserId}\n\nMessage:\n${message}`,
                    'COMPLETED': 'N',
                    'PRIORITY': 2,
                    'RESPONSIBLE_ID': 1, // Assign to admin user
                    'START_TIME': new Date().toISOString(),
                    'END_TIME': new Date().toISOString()
                }
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
                filter: { 'PHONE': phoneNumber },
                select: ['ID', 'NAME']
            });
            
            if (searchResult.result && searchResult.result.length > 0) {
                const contact = searchResult.result[0];
                console.log(`✅ Found existing contact: ${contact.NAME} (ID: ${contact.ID})`);
                return contact.ID;
            }
            
            // Create new contact
            const newContact = await this.callBitrix24Method('crm.contact.add', {
                fields: {
                    'NAME': userName || 'WhatsApp Contact',
                    'PHONE': [{ 'VALUE': phoneNumber, 'VALUE_TYPE': 'MOBILE' }],
                    'SOURCE_ID': 'WEBFORM',
                    'SOURCE_DESCRIPTION': 'WhatsApp Integration',
                    'COMMENTS': `WhatsApp User ID: ${whatsappUserId}`
                }
            });
            
            if (newContact.result) {
                console.log(`✅ Created new contact: ${userName} (ID: ${newContact.result})`);
                return newContact.result;
            }
            
            throw new Error('Contact creation failed');
            
        } catch (error) {
            console.error('❌ Error finding/creating contact:', error);
            // Return ID 1 as fallback (admin user)
            return 1;
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
            
            // Log the full response for debugging
            console.log(`📊 ${method} response:`, JSON.stringify(response.data, null, 2));
            
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
}

module.exports = customChannelApp;
