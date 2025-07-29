<?php
/**
 * DEBUG VERSION - Bitrix24 Custom Open Channel Connector Application
 * install.php - Main installation and configuration file
 */

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>Debug: PHP is working!</h1>";
echo "<p>Current time: " . date('Y-m-d H:i:s') . "</p>";
echo "<p>PHP Version: " . phpversion() . "</p>";

// Test if we can make HTTP requests
if (function_exists('curl_init')) {
    echo "<p>✅ cURL is available</p>";
} else {
    echo "<p>❌ cURL is NOT available</p>";
}

// Application configuration
define('APP_ID', getenv('APP_ID') ?: 'your_app_id_here');
define('APP_SECRET', getenv('APP_SECRET') ?: 'your_app_secret_here');
define('APP_SCOPE', 'imconnector,imopenlines,crm');

echo "<p>APP_ID: " . APP_ID . "</p>";

// Rest of your original code...
class CustomChannelApp {
    private $accessToken;
    private $bitrix24Domain;
    private $connectorId = 'custom_whatsapp';
    
    public function __construct($domain, $accessToken) {
        $this->bitrix24Domain = $domain;
        $this->accessToken = $accessToken;
    }
    
    public function install() {
        try {
            echo "<p>🔄 Starting installation...</p>";
            
            $this->registerConnector();
            echo "<p>✅ Connector registered</p>";
            
            $this->setConnectorConfig();
            echo "<p>✅ Config set</p>";
            
            $this->bindPlacement();
            echo "<p>✅ Placement bound</p>";
            
            return [
                'success' => true,
                'message' => 'Custom WhatsApp connector installed successfully!'
            ];
            
        } catch (Exception $e) {
            echo "<p>❌ Error: " . $e->getMessage() . "</p>";
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
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
    
    private function setConnectorConfig() {
        $params = [
            'CONNECTOR' => $this->connectorId,
            'LINE' => 1,
            'DATA' => [
                'id' => $this->connectorId,
                'url' => 'https://your-server.com/webhook',
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
    
    private function callBitrix24Method($method, $params = []) {
        $url = "https://{$this->bitrix24Domain}/rest/{$method}";
        
        echo "<p>🔗 Calling: $url</p>";
        
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
        
        echo "<p>📡 Response code: $httpCode</p>";
        echo "<p>📄 Response: " . substr($response, 0, 200) . "...</p>";
        
        if ($httpCode !== 200) {
            throw new Exception("HTTP Error: {$httpCode}");
        }
        
        $result = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("JSON decode error: " . json_last_error_msg());
        }
        
        return $result;
    }
    
    private function getConnectorIcon() {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
}

// Handle OAuth callback and installation
if (isset($_GET['code']) && isset($_GET['domain'])) {
    echo "<h2>🔄 Processing OAuth callback...</h2>";
    
    $domain = $_GET['domain'];
    $code = $_GET['code'];
    
    echo "<p>Domain: $domain</p>";
    echo "<p>Code: " . substr($code, 0, 20) . "...</p>";
    
    // Get access token
    $tokenUrl = "https://{$domain}/oauth/token/";
    $tokenData = [
        'grant_type' => 'authorization_code',
        'client_id' => APP_ID,
        'client_secret' => APP_SECRET,
        'code' => $code,
        'scope' => APP_SCOPE
    ];
    
    echo "<p>🔗 Token URL: $tokenUrl</p>";
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $tokenUrl,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($tokenData),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    echo "<p>📡 Token response code: $httpCode</p>";
    echo "<p>📄 Token response: " . substr($response, 0, 200) . "...</p>";
    
    $tokenResult = json_decode($response, true);
    
    if (isset($tokenResult['access_token'])) {
        echo "<p>✅ Access token received!</p>";
        
        // Install the app
        $app = new CustomChannelApp($domain, $tokenResult['access_token']);
        $installResult = $app->install();
        
        echo "<h3>Final Result:</h3>";
        echo "<pre>" . json_encode($installResult, JSON_PRETTY_PRINT) . "</pre>";
        
        if ($installResult['success']) {
            echo "<h2>🎉 SUCCESS!</h2>";
            echo "<p>Your access token: <code>" . $tokenResult['access_token'] . "</code></p>";
            echo "<p>Save this token in your .env file!</p>";
        }
    } else {
        echo "<p>❌ Failed to get access token</p>";
        echo "<pre>" . json_encode($tokenResult, JSON_PRETTY_PRINT) . "</pre>";
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
            .debug { background: #f5f5f5; padding: 10px; margin: 10px 0; border-left: 3px solid #666; }
        </style>
    </head>
    <body>
        <h1>Custom WhatsApp Connector - DEBUG VERSION</h1>
        
        <div class="debug">
            <strong>Debug Info:</strong><br>
            Current URL: <?php echo "https://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']; ?><br>
            PHP Working: ✅<br>
            Time: <?php echo date('Y-m-d H:i:s'); ?>
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
            const authUrl = `https://${domain}/oauth/authorize/?client_id=<?php echo APP_ID; ?>&response_type=code&scope=<?php echo APP_SCOPE; ?>`;
            console.log('Redirecting to:', authUrl);
            window.location.href = authUrl;
        });
        </script>
    </body>
    </html>
    <?php
}
?>
