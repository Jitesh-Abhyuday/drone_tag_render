const API_BASE = '/api';

let selectedDeviceId = null;
let devicesList = [];
let allLogsCache = [];
let socket = null;

// Format Map Actions
const getMapLinkHtml = (maplink) => {
    if (!maplink) return 'N/A';
    return `<a href="${maplink}" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 500;">Open Map ↗</a>`;
};

// Main render function for layout arrays
const renderDevicesTable = () => {
    const tbody = document.querySelector('#devicesTable tbody');
    tbody.innerHTML = '';
    
    devicesList.forEach(device => {
        const row = document.createElement('tr');
        if (selectedDeviceId === device.device_id) {
            row.classList.add('selected-row');
        }

        row.innerHTML = `
            <td><strong>${device.device_id || 'Unknown'}</strong></td>
            <td>${device.created_at || 'N/A'}</td>
        `;

        row.addEventListener('click', () => {
            selectedDeviceId = device.device_id;
            document.querySelectorAll('#devicesTable tbody tr').forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
            renderLogsDisplay();
        });

        tbody.appendChild(row);
    });
};

const renderLogsDisplay = () => {
    const tbody = document.querySelector('#logsTable tbody');
    const tableElement = document.querySelector('#logsTable');
    const placeholder = document.getElementById('logsPlaceholder');
    const header = document.getElementById('logsHeader');

    if (!selectedDeviceId) {
        tableElement.classList.add('hidden');
        placeholder.classList.remove('hidden');
        header.textContent = 'Telemetry Logs';
        return;
    }

    header.textContent = `Telemetry Logs for ${selectedDeviceId}`;
    const filteredLogs = allLogsCache.filter(log => log.device_id === selectedDeviceId);

    tbody.innerHTML = '';

    if (filteredLogs.length === 0) {
        tableElement.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.textContent = `No data packets found recorded for ${selectedDeviceId}.`;
        return;
    }

    placeholder.classList.add('hidden');
    tableElement.classList.remove('hidden');

    filteredLogs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${log.device_id}</strong></td>
            <td>${log.latitude || '0.0'}</td>
            <td>${log.longitude || '0.0'}</td>
            <td>${log.altitude || '0'}</td>
            <td>${log.timestamp || 'N/A'}</td>
            <td>${getMapLinkHtml(log.maplink)}</td>
        `;
        tbody.appendChild(row);
    });
};

// Fetch historical database layers on boot
const loadInitialData = async () => {
    try {
        const response = await fetch(`${API_BASE}/init-dashboard`);
        if (!response.ok) throw new Error('Failed to download state');
        const data = await response.json();
        
        devicesList = data.devices;
        allLogsCache = data.logs;
        
        renderDevicesTable();
        renderLogsDisplay();
    } catch (error) {
        console.error('Error loading initial state:', error);
    }
};

// Establish live WebSocket pipe connection
const connectWebSocket = () => {
    // Generate secure/unsecure socket protocols based on window deployment address
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.event === 'NEW_TELEMETRY') {
            const newLog = message.data;
            
            // Add to telemetry data cache at the top
            allLogsCache.unshift(newLog);
            if (allLogsCache.length > 150) allLogsCache.pop(); // Caps frame length

            // Check if this belongs to a completely brand new device tracker unit
            const exists = devicesList.some(d => d.device_id === newLog.device_id);
            if (!exists) {
                devicesList.unshift({
                    device_id: newLog.device_id,
                    created_at: newLog.timestamp
                });
                renderDevicesTable();
            }

            // Dynamically refresh coordinates viewport live if inspecting that system
            if (selectedDeviceId === newLog.device_id) {
                renderLogsDisplay();
            }
        }
    };

    // Auto reconnect loop back up if Render triggers dynamic sleep shifts
    socket.onclose = () => {
        console.log('WebSocket stream closed. Attempting reconnect in 4s...');
        setTimeout(connectWebSocket, 4000);
    };

    socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
        socket.close();
    };
};

const initDashboard = () => {
    loadInitialData();
    connectWebSocket();
};

document.addEventListener('DOMContentLoaded', initDashboard);