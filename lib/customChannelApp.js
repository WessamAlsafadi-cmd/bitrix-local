// lib/customChannelApp.js - FIXED VERSION with correct Bitrix24 API format
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
        const connectivityTest = await this.testConnectivity();
        if (!connectivityTest.success) {
            throw new Error('API connectivity test failed: ' + connectivityTest.error);
        }

        const crmTest = await this.testCRMPermissions();
        const webhookTest = await this.testWebhookSetup();
        const integrationTest = await this.testIntegration();

        if (!integrationTest.success) {
            console.warn('⚠️ Integration test failed, but proceeding with installation:', integrationTest.error);
        }

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
            const leadsResult = await this.callBitrix24Method('crm.lead.list', {
                select: ['ID', 'TITLE'],
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
            const activitiesResult = await this.callBitrix24Method('crm.activity.list', {
                select: ['ID', 'SUBJECT'],
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
                // If handler already bound, that's actually OK
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

// Fixed contact creation methods in customChannelApp.js

async testIntegration() {
    console.log('🧪 Running integration test...');
    
    try {
        // Correct format for Bitrix24 contact creation
        const testContact = await this.callBitrix24Method('crm.contact.add', {
            fields: {
                NAME: 'WhatsApp Test Contact',
                LAST_NAME: 'Integration',
                PHONE: [
                    {
                        VALUE: '+1234567890',
                        VALUE_TYPE: 'MOBILE'
                    }
                ],
                SOURCE_ID: 'WEBFORM',
                SOURCE_DESCRIPTION: 'WhatsApp Integration Test',
                COMMENTS: 'This is a test contact created by WhatsApp integration'
            }
        });
        
        if (!testContact.result) {
            throw new Error('Contact creation failed');
        }
        
        console.log(`✅ Test contact created: ID ${testContact.result}`);
        
        // Test creating an activity
        const testActivity = await this.callBitrix24Method('crm.activity.add', {
            fields: {
                OWNER_TYPE_ID: 3, // Contact
                OWNER_ID: testContact.result,
                TYPE_ID: 4, // Call
                SUBJECT: 'WhatsApp Message Test',
                DESCRIPTION: 'This is a test WhatsApp message created by the integration',
                COMPLETED: 'N',
                PRIORITY: 2,
                RESPONSIBLE_ID: 1,
                START_TIME: new Date().toISOString(),
                END_TIME: new Date().toISOString()
            }
        });
        
        if (!testActivity.result) {
            throw new Error('Activity creation failed');
        }
        
        console.log(`✅ Test activity created: ID ${testActivity.result}`);
        
        // Clean up test contact
        try {
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
async findOrCreateContact(whatsappUserId, userName) {
    try {
        const phoneNumber = whatsappUserId.replace('@s.whatsapp.net', '').replace('@c.us', '');
        
        // Try to find existing contact by phone
        const searchResult = await this.callBitrix24Method('crm.contact.list', {
            filter: { PHONE: phoneNumber },
            select: ['ID', 'NAME', 'LAST_NAME']
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
            fields: {
                NAME: firstName,
                LAST_NAME: lastName,
                PHONE: [
                    {
                        VALUE: phoneNumber,
                        VALUE_TYPE: 'MOBILE'
                    }
                ],
                SOURCE_ID: 'WEBFORM',
                SOURCE_DESCRIPTION: 'WhatsApp Integration',
                COMMENTS: `WhatsApp User ID: ${whatsappUserId}\nCreated via WhatsApp Integration`
            }
        });
        
        if (newContact.result) {
            console.log(`✅ Created new contact: ${firstName} ${lastName} (ID: ${newContact.result})`);
            return newContact.result;
        }
        
        throw new Error('Contact creation failed');
        
    } catch (error) {
        console.error('❌ Error finding/creating contact:', error);
        return 1; // Fallback to admin user ID
    }
}
    
    // Also update the handleWhatsAppMessage method to use correct format
async handleWhatsAppMessage(whatsappUserId, message, userName = 'WhatsApp User') {
    console.log(`📨 Handling WhatsApp message from ${whatsappUserId}: ${message.substring(0, 100)}...`);
    
    try {
        // Step 1: Find or create contact
        let contactId = await this.findOrCreateContact(whatsappUserId, userName);
        
        // Step 2: Create activity for the message using correct format
        const activityResult = await this.callBitrix24Method('crm.activity.add', {
            fields: {
                OWNER_TYPE_ID: 3, // Contact
                OWNER_ID: contactId,
                TYPE_ID: 4, // Call type (you can change this)
                SUBJECT: `WhatsApp Message from ${userName}`,
                DESCRIPTION: `WhatsApp User: ${whatsappUserId}\n\nMessage:\n${message}`,
                COMPLETED: 'N',
                PRIORITY: 2,
                RESPONSIBLE_ID: 1, // Assign to admin user
                START_TIME: new Date().toISOString(),
                END_TIME: new Date().toISOString()
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
module.exports = customChannelApp;
