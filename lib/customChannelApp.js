// lib/customChannelApp.js - UPDATED VERSION WITH PLACEMENTS
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

    // In customChannelApp.js

// ... (keep the rest of the file the same)

// UPDATED: setupPlacements function to be more robust
async setupPlacements() {
    console.log('🎯 Setting up Bitrix24 placements with a clean-and-rebind strategy...');
    
    // NOTE: 'APPLICATION_LIST' is not a valid placement and has been removed.
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
            // STEP 1: Always try to unbind first to clear any stale registrations.
            // We wrap this in a try-catch because it will fail on a fresh install, which is expected.
            try {
                console.log(`🧹 Attempting to unbind placement: ${p.placement}`);
                await this.callBitrix24Method('placement.unbind', {
                    PLACEMENT: p.placement,
                    HANDLER: p.handler,
                });
                console.log(`✅ Unbind successful for ${p.placement} (or was not bound).`);
            } catch (unbindError) {
                // This error is expected if the placement wasn't bound before. We can ignore it.
                console.log(`ℹ️ Info: Could not unbind ${p.placement}. It might be the first installation. Error: ${unbindError.message}`);
            }

            // STEP 2: Now, bind the placement.
            console.log(`📍 Binding placement: ${p.placement}`);
            const result = await this.callBitrix24Method('placement.bind', {
                PLACEMENT: p.placement,
                HANDLER: p.handler,
                TITLE: p.title
            });
            
            if (result && result.result) {
                results.push({ 
                    placement: p.placement, 
                    success: true,
                    message: 'Successfully unbound and rebound.'
                });
                console.log(`✅ Placement ${p.placement} installed successfully.`);
            } else {
                 results.push({ 
                    placement: p.placement, 
                    success: false, 
                    error: 'Bind command did not return a successful result.'
                });
                 console.error(`❌ Placement ${p.placement} failed on bind.`);
            }
            
        } catch (error) {
            results.push({ 
                placement: p.placement, 
                success: false, 
                error: error.message
            });
            console.error(`❌ A critical error occurred for placement ${p.placement}:`, error.message);
        }
    }
    
    return { placements: results };
}

async createMenuItem() {
    try {
        const result = await this.callBitrix24Method('app.option.set', {
            option: 'menu_item',
            value: JSON.stringify({
                text: 'WhatsApp Connector',
                onclick: `window.open('${this.baseUrl}/app?domain=${this.bitrix24Domain}&access_token=${this.accessToken}', '_blank');`
            })
        });
        
        console.log('✅ Menu item created:', result);
        return { success: true, result };
    } catch (error) {
        console.error('❌ Menu item creation failed:', error);
        return { success: false, error: error.message };
    }
}
    // Updated install method with placement setup
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

            // Step 4: Setup placements (NEW!)
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
        console.log('🔍 Testing basic API connectivity...');
        
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
                'event.bind',
                'placement.bind'  // Added placement support
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
            
            console.log('🔍 Creating test activity...');
            const testActivity = await this.callBitrix24Method('crm.activity.add', {
              "fields": {
                "OWNER_TYPE_ID": 3,
                "OWNER_ID": testContact.result,
                "TYPE_ID": 4,
                "SUBJECT": "WhatsApp Message Test",
                "DESCRIPTION": "This is a test WhatsApp message created by the integration",
                "COMPLETED": "N",
                "PRIORITY": 2,
                "RESPONSIBLE_ID": 1,
                "COMMUNICATIONS": [
                  {
                    "VALUE": "+1234567890",
                    "TYPE": "PHONE",
                    "ENTITY_ID": testContact.result,
                    "ENTITY_TYPE_ID": 3
                  }
                ]
              }
            }
            );
            
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
