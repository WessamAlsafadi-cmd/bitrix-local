<!-- [Previous content remains unchanged until the <script> section] -->

<script>
    function debugLog(message) {
        const debugElement = document.getElementById('debugLog');
        const timestamp = new Date().toLocaleTimeString();
        debugElement.innerHTML += `<div>[${timestamp}] ${message}</div>`;
        debugElement.scrollTop = debugElement.scrollHeight;
        console.log(`[DEBUG] ${message}`);
    }

    let socket;
    let isConnected = false;
    let messageCount = 0;

    function initSocket() {
        debugLog('🔌 Initializing Socket.IO connection...');
        socket = io();
        
        socket.on('connect', () => {
            debugLog('✅ Connected to server - Socket ID: ' + socket.id);
            updateStatus('configStatus', 'Connected to server', 'success');
            document.getElementById('bitrixConnectionStatus').textContent = '✅ Connected';
        });
        
        socket.on('disconnect', () => {
            debugLog('❌ Disconnected from server');
            updateStatus('configStatus', 'Disconnected from server', 'error');
            document.getElementById('bitrixConnectionStatus').textContent = '❌ Disconnected';
            document.getElementById('whatsappConnectionStatus').textContent = '❌ Disconnected';
            isConnected = false;
        });
        
        socket.on('qr_code', (qr) => {
            debugLog('📱 QR Code received - Length: ' + qr.length);
            console.log('QR Data:', qr.substring(0, 100) + '...');
            try {
                if (typeof QRCode === 'undefined') {
                    debugLog('❌ QRCode library not loaded');
                    displayRawQrData(qr);
                    updateStatus('whatsappStatus', 'QRCode library failed to load. See raw data below.', 'error');
                    return;
                }
                displayQRCode(qr);
                activateStep(2);
                updateStatus('whatsappStatus', 'QR Code received. Please scan with your phone.', 'info');
            } catch (error) {
                debugLog('❌ Error displaying QR code: ' + error.message);
                displayRawQrData(qr);
                updateStatus('whatsappStatus', 'Error displaying QR code: ' + error.message + '. See raw data below.', 'error');
            }
        });
        
        socket.on('status_update', (status) => {
            debugLog('📊 Status update: ' + status);
            updateStatus('whatsappStatus', status, 'info');
            if (status.includes('Connected')) {
                isConnected = true;
                updateConnectionStatus();
                activateStep(3);
            } else if (status.includes('QR Code generated')) {
                activateStep(2);
            }
        });
        
        socket.on('whatsapp_connected', () => {
            debugLog('🎉 WhatsApp connected successfully!');
            isConnected = true;
            updateStatus('whatsappStatus', '✅ WhatsApp connected successfully!', 'success');
            document.getElementById('whatsappConnectionStatus').textContent = '✅ Connected';
            document.getElementById('qrContainer').classList.add('hidden');
            updateConnectionStatus();
            activateStep(3);
        });
        
        socket.on('message_received', (messageData) => {
            debugLog('📨 Message received from: ' + (messageData.userName || 'Unknown'));
            messageCount++;
            document.getElementById('messagesProcessed').textContent = messageCount;
        });
        
        socket.on('error', (error) => {
            debugLog('❌ Socket error: ' + error);
            updateStatus('configStatus', `Error: ${error}`, 'error');
            hideLoading();
        });

        socket.on('status_response', (status) => {
            debugLog('📋 Status response received');
            console.log('Status response:', status);
            document.getElementById('whatsappConnectionStatus').textContent = 
                status.whatsappConnected ? '✅ Connected' : '❌ Disconnected';
            document.getElementById('activeSessions').textContent = status.activeSessions || 0;
            isConnected = status.whatsappConnected;
            updateConnectionStatus();
            if (status.whatsappConnected) {
                activateStep(3);
            } else {
                activateStep(1);
            }
        });
    }

    // [Rest of the functions (updateStatus, displayQRCode, etc.) remain unchanged]
</script>
