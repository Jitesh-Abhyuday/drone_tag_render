const API_BASE = '/api';
const ADMIN_KEYCODE = 'admin123';

let selectedDeviceId = null;
let devicesList = [];
let allLogsCache = [];
let socket = null;
let isAdminMode = false;

const getMapLinkHtml = (maplink) => {
    if (!maplink) return 'N/A';
    return `<a href="${maplink}" target="_blank" style="color: var(--accent); text-decoration: none; font-weight: 500;">Open Map ↗</a>`;
};

/**
 * Calculates time differences against current local runtime context clocks
 * Returns a structural status configuration object
 */
const calculateHeartbeatStatus = (lastSeenEpoch) => {
    if (!lastSeenEpoch) return { class: 'status-offline', label: 'Offline' };
    
    const diffMs = Date.now() - Number(lastSeenEpoch);
    const diffMinutes = diffMs / 1000 / 60;

    if (diffMinutes <= 2) {
        return { class: 'status-active', label: 'Active' };
    } else if (diffMinutes <= 15) {
        return { class: 'status-delayed', label: 'Delayed' };
    } else {
        return { class: 'status-offline', label: 'Offline' };
    }
};

/**
 * Re-renders the Device Fleet sidebar pane list
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
        
        const cleanCurrentId = String(device.device_id).trim();
        if (selectedDeviceId && String(selectedDeviceId).trim() === cleanCurrentId) {
            row.classList.add('selected-row');
        }

        // Determine current network runtime heartbeat state configuration
        const status = calculateHeartbeatStatus(device.last_seen);

        row.innerHTML = `
            <div class="fleet-info-block">
                <div class="fleet-meta-box">
                    <span class="status-dot ${status.class}" title="Device status: ${status.label}"></span>
                    <span class="fleet-id">${cleanCurrentId}</span>
                </div>
                <span class="fleet-date">Reg: ${device.created_at || 'N/A'}</span>
            </div>
            <button class="btn-delete admin-field ${isAdminMode ? '' : 'hidden'}" data-id="${cleanCurrentId}">Purge</button>
        `;

        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete')) return;
            selectedDeviceId = cleanCurrentId;
            document.querySelectorAll('.fleet-row').forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
            renderLogsDisplay();
        });

        const deleteBtn = row.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', async () => {
            const confirmPurge = confirm(`🚨 SYSTEM CRITICAL WARNING:\nAre you sure you want to delete Device "${cleanCurrentId}"?`);
            if (confirmPurge) {
                try {
                    await fetch(`${API_BASE}/devices/${encodeURIComponent(cleanCurrentId)}`, { method: 'DELETE' });
                } catch (err) { console.error(err); }
            }
        });

        container.appendChild(row);
    });
};

/**
 * Refreshes only the visual heartbeat dot elements in-place to avoid total component flashes
 */
const updateHeartbeatDotsOnly = () => {
    const rows = document.querySelectorAll('.fleet-row');
    rows.forEach((row, index) => {
        const device = devicesList[index];
        if (!device) return;
        
        const status = calculateHeartbeatStatus(device.last_seen);
        const dot = row.querySelector('.status-dot');
        if (dot) {
            dot.className = `status-dot ${status.class}`;
            dot.title = `Device status: ${status.label}`;
        }
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

    const cleanSelectedId = String(selectedDeviceId).trim();
    header.textContent = `Telemetry Logs for ${cleanSelectedId}`;
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

        const deleteLogBtn = row.querySelector('.btn-delete');
        deleteLogBtn.addEventListener('click', async () => {
            if (confirm(`Delete this specific data packet entry?`)) {
                try {
                    await fetch(`${API_BASE}/logs/${log.id}`, { method: 'DELETE' });
                } catch (err) { console.error(err); }
            }
        });

        tbody.appendChild(row);
    });
};

const loadInitialData = async () => {
    try {
        const response = await fetch(`${API_BASE}/init-dashboard`);
        if (!response.ok) throw new Error('Failed to load indices');
        const data = await response.json();
        
        devicesList = data.devices;
        allLogsCache = data.logs;
        
        renderDevicesTable();
        renderLogsDisplay();
    } catch (error) { console.error(error); }
};

const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.event === 'NEW_TELEMETRY') {
            const newLog = message.data;
            const liveTimestamp = message.last_seen;
            const incomingDeviceId = String(newLog.device_id).trim();

            allLogsCache.unshift(newLog);
            if (allLogsCache.length > 150) allLogsCache.pop();

            // Locate and refresh target tracker entry runtime metrics inside internal list cache
            const targetDevice = devicesList.find(d => String(d.device_id).trim() === incomingDeviceId);
            
            if (!targetDevice) {
                devicesList.unshift({ 
                    device_id: incomingDeviceId, 
                    created_at: newLog.timestamp,
                    last_seen: liveTimestamp 
                });
                renderDevicesTable();
            } else {
                targetDevice.last_seen = liveTimestamp;
                renderDevicesTable(); // Triggers structural top-resort positioning alignment
            }

            if (selectedDeviceId && String(selectedDeviceId).trim() === incomingDeviceId) {
                renderLogsDisplay();
            }
        } 
        else if (message.event === 'LOG_DELETED') {
            allLogsCache = allLogsCache.filter(log => log.id !== message.id);
            if (selectedDeviceId) renderLogsDisplay();
        } 
        else if (message.event === 'DEVICE_DELETED') {
            const deletedTargetId = String(message.device_id).trim();
            devicesList = devicesList.filter(d => String(d.device_id).trim() !== deletedTargetId);
            allLogsCache = allLogsCache.filter(log => String(log.device_id).trim() !== deletedTargetId);
            if (selectedDeviceId && String(selectedDeviceId).trim() === deletedTargetId) selectedDeviceId = null;
            renderDevicesTable();
            renderLogsDisplay();
        }
    };

    socket.onclose = () => setTimeout(connectWebSocket, 4000);
};

const initDashboard = () => {
    loadInitialData();
    connectWebSocket();

    // Theme Engine setup
    const cachedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (cachedTheme === 'light' || (!cachedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
    }

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

    // Localized UI Loop: Recalculates time delta colors every 10 seconds on browser background layers
    setInterval(updateHeartbeatDotsOnly, 10000);

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