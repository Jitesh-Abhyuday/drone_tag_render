const API_BASE = '/api';
const ADMIN_KEYCODE = 'admin123'; // Change this token string to your preferred administrative passcode

let selectedDeviceId = null;
let devicesList = [];
let allLogsCache = [];
let socket = null;
let isAdminMode = false;

/**
 * Generates an anchor element tracking link if present
 */
const getMapLinkHtml = (maplink) => {
    if (!maplink) return 'N/A';
    return `<a href="${maplink}" target="_blank" style="color: var(--accent); text-decoration: none; font-weight: 500;">Open Map ↗</a>`;
};

/**
 * Renders the Device Fleet side-panel list using responsive flex cards
 */
const renderDevicesTable = () => {
    const container = document.getElementById('deviceFleetList');
    container.innerHTML = '';
    
    if (devicesList.length === 0) {
        container.innerHTML = '<div class="placeholder-text">No active tracking units found in fleet.</div>';
        return;
    }

    devicesList.forEach(device => {
        const row = document.createElement('div');
        row.className = 'fleet-row';
        
        // Apply selection class using strict normalized comparison keys
        const cleanCurrentId = String(device.device_id).trim();
        const cleanSelectedId = selectedDeviceId ? String(selectedDeviceId).trim() : null;

        if (cleanSelectedId === cleanCurrentId) {
            row.classList.add('selected-row');
        }

        row.innerHTML = `
            <div class="fleet-info-block">
                <span class="fleet-id">${cleanCurrentId}</span>
                <span class="fleet-date">Reg: ${device.created_at || 'N/A'}</span>
            </div>
            <button class="btn-delete admin-field ${isAdminMode ? '' : 'hidden'}" data-id="${cleanCurrentId}">Purge</button>
        `;

        // Selection routing logic click listener
        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete')) return; // Prevent bubble click overlap
            selectedDeviceId = cleanCurrentId;
            document.querySelectorAll('.fleet-row').forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
            renderLogsDisplay();
        });

        // Delete Whole Device Action Handler
        const deleteBtn = row.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', async () => {
            const confirmPurge = confirm(`🚨 SYSTEM CRITICAL WARNING:\nAre you absolutely sure you want to delete Device "${cleanCurrentId}"?\nThis wipes out all telemetry history logs across the entire database permanently.`);
            if (confirmPurge) {
                try {
                    const response = await fetch(`${API_BASE}/devices/${encodeURIComponent(cleanCurrentId)}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Network error during deletion conversion');
                } catch (err) { 
                    console.error('Error executing cascade purge sequence:', err); 
                }
            }
        });

        container.appendChild(row);
    });
};

/**
 * Filters the master logs cache and renders rows matching the selected device
 */
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

    const cleanSelectedId = String(selectedDeviceId).trim();
    header.textContent = `Telemetry Logs for ${cleanSelectedId}`;
    
    // Filter array via cross-referenced clean keys
    const filteredLogs = allLogsCache.filter(log => String(log.device_id).trim() === cleanSelectedId);

    tbody.innerHTML = '';

    if (filteredLogs.length === 0) {
        tableElement.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.textContent = `No data packets currently recorded for ${cleanSelectedId}.`;
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
            <td class="admin-field ${isAdminMode ? '' : 'hidden'}">
                <button class="btn-delete" data-logid="${log.id}">Delete</button>
            </td>
        `;

        // Single Log Segment Delete Action Handler
        const deleteLogBtn = row.querySelector('.btn-delete');
        deleteLogBtn.addEventListener('click', async () => {
            if (confirm(`Delete this specific data packet coordinate block entry?`)) {
                try {
                    const response = await fetch(`${API_BASE}/logs/${log.id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Failed segment removal call');
                } catch (err) { 
                    console.error('Error deleting specific packet row instance:', err); 
                }
            }
        });

        tbody.appendChild(row);
    });
};

/**
 * Downloads bootstrap historical data frame indexes on page mount
 */
const loadInitialData = async () => {
    try {
        const response = await fetch(`${API_BASE}/init-dashboard`);
        if (!response.ok) throw new Error('Failed to synchronize initial server state context');
        const data = await response.json();
        
        devicesList = data.devices;
        allLogsCache = data.logs;
        
        renderDevicesTable();
        renderLogsDisplay();
    } catch (error) { 
        console.error('Initial indices payload download failed:', error); 
    }
};

/**
 * Establishes real-time duplex synchronization via active WebSocket pipe
 */
const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        // Real-Time Event 1: New Tracker Packet Received
        if (message.event === 'NEW_TELEMETRY') {
            const newLog = message.data;
            const incomingDeviceId = String(newLog.device_id).trim();
            const currentSelectedId = selectedDeviceId ? String(selectedDeviceId).trim() : null;

            allLogsCache.unshift(newLog);
            if (allLogsCache.length > 150) allLogsCache.pop(); // Caps client memory load array frames

            const exists = devicesList.some(d => String(d.device_id).trim() === incomingDeviceId);
            if (!exists) {
                devicesList.unshift({ device_id: incomingDeviceId, created_at: newLog.timestamp });
                renderDevicesTable();
            } else if (isAdminMode) {
                // Ensure layout buttons remain systematically visible if list renders dynamically
                renderDevicesTable(); 
            }

            // Instantly render log updates onto the display container grid if active
            if (currentSelectedId === incomingDeviceId) {
                renderLogsDisplay();
            }
        } 
        
        // Real-Time Event 2: Target Log Point Purged by an Admin
        else if (message.event === 'LOG_DELETED') {
            allLogsCache = allLogsCache.filter(log => log.id !== message.id);
            if (selectedDeviceId) renderLogsDisplay();
        } 
        
        // Real-Time Event 3: Complete Device Cascade-Wiped out by an Admin
        else if (message.event === 'DEVICE_DELETED') {
            const deletedTargetId = String(message.device_id).trim();
            
            devicesList = devicesList.filter(d => String(d.device_id).trim() !== deletedTargetId);
            allLogsCache = allLogsCache.filter(log => String(log.device_id).trim() !== deletedTargetId);
            
            if (selectedDeviceId && String(selectedDeviceId).trim() === deletedTargetId) {
                selectedDeviceId = null;
            }
            renderDevicesTable();
            renderLogsDisplay();
        }
    };

    // Auto-reconnect engine tracking loop
    socket.onclose = () => {
        console.log('Real-time pipeline disconnected. Retrying stream handshake in 4s...');
        setTimeout(connectWebSocket, 4000);
    };

    socket.onerror = (err) => {
        console.error('Socket engine encountered structural exception:', err);
        socket.close();
    };
};

/**
 * Initialize Dashboard
 */
const initDashboard = () => {
    loadInitialData();
    connectWebSocket();

    // Theme Engine Handshake (Validates stored values or default system configs)
    const cachedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    
    if (cachedTheme === 'light' || (!cachedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    // Theme Toggle Handler
    document.getElementById('themeToggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'light') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    });

    // Admin Mode Change Handler with prompt validation check
    const toggle = document.getElementById('adminToggle');
    toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            const accessPass = prompt('Enter System Administration Verification Passcode:');
            if (accessPass === ADMIN_KEYCODE) {
                isAdminMode = true;
                document.querySelectorAll('.admin-field').forEach(el => el.classList.remove('hidden'));
            } else {
                alert('Verification Access Denied: Invalid Keycode Token');
                e.target.checked = false;
                isAdminMode = false;
            }
        } else {
            isAdminMode = false;
            document.querySelectorAll('.admin-field').forEach(el => el.classList.add('hidden'));
        }
    });
};

document.addEventListener('DOMContentLoaded', initDashboard);