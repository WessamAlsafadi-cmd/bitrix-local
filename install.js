/**
 * Bitrix24 Custom WhatsApp Connector - Node.js Installation Server
 * Replaces install.php for Render.com deployment
 */

const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const APP_ID = process.env.APP_ID || 'your_app_id_here';
const APP_SECRET = process.env.APP_SECRET || 'your_app_secret_here';
const APP_SCOPE = 'imconnector,imopenlines,crm';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

class CustomChannelApp {
    constructor(domain, accessToken) {
        this.bitrix24Domain = domain;
        this.accessToken = accessToken;
        this.connectorId = 'custom_whatsapp';
    }

    async install() {
        try {
            console.log('🔄 Starting installation...');
            
            await this.registerConnector();
            console.log('✅ Connector registered');
            
            await this.setConnectorConfig();
            console.log('✅ Config set');
            
            await this.bindPlacement();
            console.log('✅ Placement bound');
            
            return {
                success: true,
                message: 'Custom WhatsApp connector installed successfully!'
            };
            
        } catch (error) {
            console.error('❌ Installation error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async registerConnector() {
        const params = {
            CONNECTOR: this.connectorId,
            NAME: 'Custom WhatsApp',
            ICON_FILE: this.getConnectorIcon(),
            PLACEMENT: 'CONTACT_CENTER',
            COMPONENT: '/local/components/custom.whatsapp/',
            MODULE_ID: 'custom.whatsapp'
        };
        
        const result = await this.callBitrix24Method('imconnector.register', params);
        
        if (!result.result) {
            throw new Error('Failed to register connector: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async setConnectorConfig() {
        const params = {
            CONNECTOR: this.connectorId,
            LINE: 1,
            DATA: {
                id: this.connectorId,
                url: 'https://bitrix-local.onrender.com/webhook',
                name: 'Custom WhatsApp Connector',
                description: 'Connect regular WhatsApp via Baileys.js',
                icon: 'fa fa-whatsapp',
                settings: {
                    phone_number: '',
                    webhook_url: 'https://bitrix-local.onrender.com/bitrix24/webhook',
                    status: 'inactive'
                }
            }
        };
        
        const result = await this.callBitrix24Method('imconnector.connector.data.set', params);
        
        if (!result.result) {
            throw new Error('Failed to set connector config: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async bindPlacement() {
        const params = {
            PLACEMENT: 'CONTACT_CENTER',
            HANDLER: 'https://bitrix-local.onrender.com/app/widget',
            TITLE: 'Custom WhatsApp',
            DESCRIPTION: 'Manage WhatsApp conversations'
        };
        
        const result = await this.callBitrix24Method('placement.bind', params);
        
        if (!result.result) {
            throw new Error('Failed to bind placement: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async activateConnector(lineId = 1) {
        const params = {
            CONNECTOR: this.connectorId,
            LINE: lineId,
            ACTIVE: 'Y'
        };
        
        const result = await this.callBitrix24Method('imconnector.activate', params);
        
        if (!result.result) {
            throw new Error('Failed to activate connector: ' + JSON.stringify(result));
        }
        
        return result;
    }

    async callBitrix24Method(method, params = {}) {
        const url = `https://${this.bitrix24Domain}/rest/${method}`;
        
        console.log(`🔗 Calling: ${url}`);
        
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
            console.log(`📄 Response:`, JSON.stringify(response.data).substring(0, 200) + '...');
            
            return response.data;
            
        } catch (error) {
            console.error('API Error:', error.response?.data || error.message);
            throw new Error(`HTTP Error: ${error.response?.status || 'Network Error'}`);
        }
    }

    getConnectorIcon() {
        // WhatsApp-style icon base64
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Bitrix24 WhatsApp Connector Installer'
    });
});

// Installation form (replaces the PHP form)
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Custom WhatsApp Connector - Installation</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input[type="text"] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
            button { background: #25d366; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #128c7e; }
            .info { background: #f0f8ff; padding: 15px; border-left: 4px solid #007bff; margin-bottom: 20px; }
            .debug { background: #f5f5f5; padding: 10px; margin: 10px 0; border-left: 3px solid #666; }
        </style>
    </head>
    <body>
        <h1>Custom WhatsApp Connector - Node.js Version</h1>
        
        <div class="debug">
            <strong>Debug Info:</strong><br>
            Current URL: ${req.protocol}://${req.get('host')}${req.originalUrl}<br>
            Node.js Working: ✅<br>
            Time: ${new Date().toISOString()}<br>
            APP_ID: ${APP_ID}
        </div>
        
        <div class="info">
            <h3>Installation Instructions:</h3>
            <ol>
                <li>Enter your Bitrix24 domain below</li>
                <li>Click "Install App" to authorize</li>
                <li>Complete the OAuth flow</li>
                <li>Your custom connector will be registered</li>
            </ol>
        </div>
        
        <form id="installForm">
            <div class="form-group">
                <label for="domain">Bitrix24 Domain:</label>
                <input type="text" id="domain" name="domain" placeholder="your-company.bitrix24.com" required>
            </div>
            <button type="submit">Install App</button>
        </form>
        
        <script>
        document.getElementById('installForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const domain = document.getElementById('domain').value;
            const authUrl = \`https://\${domain}/oauth/authorize/?client_id=${APP_ID}&response_type=code&scope=${APP_SCOPE}&redirect_uri=\${window.location.origin}/oauth/callback\`;
            console.log('Redirecting to:', authUrl);
            window.location.href = authUrl;
        });
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// OAuth callback handler (replaces PHP OAuth handling)
app.get('/oauth/callback', async (req, res) => {
    const { code, domain, state } = req.query;
    
    if (!code || !domain) {
        return res.status(400).json({
            success: false,
            error: 'Missing code or domain parameter'
        });
    }
    
    try {
        console.log('🔄 Processing OAuth callback...');
        console.log('Domain:', domain);
        console.log('Code:', code.substring(0, 20) + '...');
        
        // Exchange code for access token
        const tokenUrl = `https://${domain}/oauth/token/`;
        const tokenData = {
            grant_type: 'authorization_code',
            client_id: APP_ID,
            client_secret: APP_SECRET,
            code: code,
            scope: APP_SCOPE
        };
        
        console.log('🔗 Token URL:', tokenUrl);
        
        const tokenResponse = await axios.post(tokenUrl, querystring.stringify(tokenData), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log('📡 Token response code:', tokenResponse.status);
        console.log('📄 Token response:', JSON.stringify(tokenResponse.data).substring(0, 200) + '...');
        
        const tokenResult = tokenResponse.data;
        
        if (tokenResult.access_token) {
            console.log('✅ Access token received!');
            
            // Install the app
            const app = new CustomChannelApp(domain, tokenResult.access_token);
            const installResult = await app.install();
            
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Installation Result</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .success { background: #d4edda; padding: 15px; border-left: 4px solid #28a745; margin-bottom: 20px; }
                    .error { background: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin-bottom: 20px; }
                    code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; }
                    pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>Installation Result</h1>
                
                ${installResult.success ? 
                    `<div class="success">
                        <h2>🎉 SUCCESS!</h2>
                        <p>${installResult.message}</p>
                        <p><strong>Your access token:</strong></p>
                        <code>${tokenResult.access_token}</code>
                        <p><strong>Save this token in your .env file!</strong></p>
                        <p>Add this line to your .env:</p>
                        <pre>BITRIX24_ACCESS_TOKEN=${tokenResult.access_token}</pre>
                    </div>` : 
                    `<div class="error">
                        <h2>❌ Installation Failed</h2>
                        <p>Error: ${installResult.error}</p>
                    </div>`
                }
                
                <h3>Final Result:</h3>
                <pre>${JSON.stringify(installResult, null, 2)}</pre>
                
                <p><a href="/">← Back to installer</a></p>
            </body>
            </html>
            `;
            
            res.send(html);
        } else {
            throw new Error('Failed to get access token: ' + JSON.stringify(tokenResult));
        }
        
    } catch (error) {
        console.error('❌ OAuth callback error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Bitrix24 WhatsApp Connector Installer running on port ${PORT}`);
    console.log(`📍 Visit: http://localhost:${PORT} (or your Render URL)`);
});

module.exports = app;
