<?php
/**
 * Bitrix24 Custom Open Channel Connector Application
 * install.php - Main installation and configuration file
 */

// Application configuration
// Update these lines in install.php
define('APP_ID', getenv('APP_ID') ?: 'your_app_id_here');
define('APP_SECRET', getenv('APP_SECRET') ?: 'your_app_secret_here');
define('APP_SCOPE', 'imconnector,imopenlines,crm'); // Required scopes

class CustomChannelApp {
    private $accessToken;
    private $bitrix24Domain;
    private $connectorId = 'custom_whatsapp'; // Your connector ID
    
    public function __construct($domain, $accessToken) {
        $this->bitrix24Domain = $domain;
        $this->accessToken = $accessToken;
    }
    
    /**
     * Install the application and register the connector
     */
    public function install() {
        try {
            // Step 1: Register the custom connector
            $this->registerConnector();
            
            // Step 2: Set connector configuration
            $this->setConnectorConfig();
            
            // Step 3: Bind placement for Contact Center
            $this->bindPlacement();
            
            return [
                'success' => true,
                'message' => 'Custom WhatsApp connector installed successfully!'
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    /**
     * Register the custom connector with Bitrix24
     */
    private function registerConnector() {
        $params = [
            'CONNECTOR' => $this->connectorId,
            'NAME' => 'Custom WhatsApp',
            'ICON_FILE' => $this->getConnectorIcon(),
            'PLACEMENT' => 'CONTACT_CENTER',
            'COMPONENT' => '/local/components/custom.whatsapp/',
            'MODULE_ID' => 'custom.whatsapp'
        ];
        
        $result = $this->callBitrix24Method('imconnector.register', $params);
        
        if (!$result['result']) {
            throw new Exception('Failed to register connector: ' . json_encode($result));
        }
        
        return $result;
    }
    
    /**
     * Set connector configuration data
     */
    private function setConnectorConfig() {
        $params = [
            'CONNECTOR' => $this->connectorId,
            'LINE' => 1, // Default line ID
            'DATA' => [
                'id' => $this->connectorId,
                'url' => 'https://your-server.com/webhook', // Your webhook URL for receiving messages
                'name' => 'Custom WhatsApp Connector',
                'description' => 'Connect regular WhatsApp via Baileys.js',
                'icon' => 'fa fa-whatsapp',
                'settings' => [
                    'phone_number' => '',
                    'webhook_url' => 'https://your-server.com/bitrix24/webhook',
                    'status' => 'inactive'
                ]
            ]
        ];
        
        $result = $this->callBitrix24Method('imconnector.connector.data.set', $params);
        
        if (!$result['result']) {
            throw new Exception('Failed to set connector config: ' . json_encode($result));
        }
        
        return $result;
    }
    
    /**
     * Bind placement for Contact Center widget
     */
    private function bindPlacement() {
        $params = [
            'PLACEMENT' => 'CONTACT_CENTER',
            'HANDLER' => 'https://your-server.com/app/widget.php',
            'TITLE' => 'Custom WhatsApp',
            'DESCRIPTION' => 'Manage WhatsApp conversations'
        ];
        
        $result = $this->callBitrix24Method('placement.bind', $params);
        
        if (!$result['result']) {
            throw new Exception('Failed to bind placement: ' . json_encode($result));
        }
        
        return $result;
    }
    
    /**
     * Activate the connector
     */
    public function activateConnector($lineId = 1) {
        $params = [
            'CONNECTOR' => $this->connectorId,
            'LINE' => $lineId,
            'ACTIVE' => 'Y'
        ];
        
        $result = $this->callBitrix24Method('imconnector.activate', $params);
        
        if (!$result['result']) {
            throw new Exception('Failed to activate connector: ' . json_encode($result));
        }
        
        return $result;
    }
    
    /**
     * Send message through the connector
     */
    public function sendMessage($chatId, $message, $from = []) {
        $params = [
            'CONNECTOR' => $this->connectorId,
            'LINE' => 1,
            'MESSAGES' => [
                [
                    'im' => [
                        'chat_id' => $chatId,
                        'message_id' => uniqid(),
                        'date' => date('c'),
                        'from' => $from ?: [
                            'id' => 'whatsapp_' . time(),
                            'name' => 'WhatsApp User',
                            'avatar' => ''
                        ],
                        'message' => [
                            'text' => $message
                        ]
                    ],
                    'chat' => [
                        'id' => $chatId,
                        'name' => 'WhatsApp Chat'
                    ]
                ]
            ]
        ];
        
        return $this->callBitrix24Method('imconnector.send.messages', $params);
    }
    
    /**
     * Get connector status
     */
    public function getConnectorStatus() {
        $params = [
            'CONNECTOR' => $this->connectorId
        ];
        
        return $this->callBitrix24Method('imconnector.status', $params);
    }
    
    /**
     * Make API call to Bitrix24
     */
    private function callBitrix24Method($method, $params = []) {
        $url = "https://{$this->bitrix24Domain}/rest/{$method}";
        
        $postData = array_merge($params, [
            'auth' => $this->accessToken
        ]);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($postData),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded'
            ]
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new Exception("HTTP Error: {$httpCode}");
        }
        
        $result = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("JSON decode error: " . json_last_error_msg());
        }
        
        return $result;
    }
    
    /**
     * Get connector icon (base64 encoded)
     */
    private function getConnectorIcon() {
        // WhatsApp green icon base64 - replace with your own icon
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
}

// Handle OAuth callback and installation
if (isset($_GET['code']) && isset($_GET['domain'])) {
    // Exchange code for access token
    $domain = $_GET['domain'];
    $code = $_GET['code'];
    
    // Get access token
    $tokenUrl = "https://{$domain}/oauth/token/";
    $tokenData = [
        'grant_type' => 'authorization_code',
        'client_id' => APP_ID,
        'client_secret' => APP_SECRET,
        'code' => $code,
        'scope' => APP_SCOPE
    ];
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $tokenUrl,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($tokenData),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    $tokenResult = json_decode($response, true);
    
    if (isset($tokenResult['access_token'])) {
        // Install the app
        $app = new CustomChannelApp($domain, $tokenResult['access_token']);
        $installResult = $app->install();
        
        if ($installResult['success']) {
            echo json_encode([
                'success' => true,
                'message' => 'App installed successfully!',
                'access_token' => $tokenResult['access_token'],
                'refresh_token' => $tokenResult['refresh_token']
            ]);
        } else {
            echo json_encode($installResult);
        }
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get access token',
            'details' => $tokenResult
        ]);
    }
} else {
    // Show installation form
    ?>
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
        </style>
    </head>
    <body>
        <h1>Custom WhatsApp Connector</h1>
        
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
            const authUrl = `https://${domain}/oauth/authorize/?client_id=<?php echo APP_ID; ?>&response_type=code&scope=<?php echo APP_SCOPE; ?>`;
            window.location.href = authUrl;
        });
        </script>
    </body>
    </html>
    <?php
}
?>