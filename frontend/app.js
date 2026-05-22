// const API_BASE = '/api';

// // Tracking state for selected device
// let selectedDeviceId = null;
// let allLogsCache = [];

// // Helper to handle blank string dates
// const formatStringDate = (dateStr) => {
//     return dateStr ? dateStr : 'N/A';
// };

// // Fetch and render the Device Fleet list
// const fetchDevices = async () => {
//     try {
//         const response = await fetch(`${API_BASE}/devices`);
//         if (!response.ok) throw new Error('Failed to fetch devices');
//         const devices = await response.json();
        
//         const tbody = document.querySelector('#devicesTable tbody');
//         tbody.innerHTML = '';
        
//         devices.forEach(device => {
//             const row = document.createElement('tr');
            
//             // Reapply selection highlight if auto-refresh triggers
//             if (selectedDeviceId === device.device_id) {
//                 row.classList.add('selected-row');
//             }

//             row.innerHTML = `
//                 <td><strong>${device.device_id || 'Unknown'}</strong></td>
//                 <td>${formatStringDate(device.created_at)}</td>
//             `;

//             // Click listener to select specific module
//             row.addEventListener('click', () => {
//                 selectedDeviceId = device.device_id;
                
//                 // Clear out previous row selections and highlight this one
//                 document.querySelectorAll('#devicesTable tbody tr').forEach(r => r.classList.remove('selected-row'));
//                 row.classList.add('selected-row');
                
//                 // Update headers and apply filters immediately
//                 updateLogsDisplay();
//             });

//             tbody.appendChild(row);
//         });
//     } catch (error) {
//         console.error('Error in fetchDevices:', error);
//     }
// };

// // Pull logs from server into storage cache
// const fetchLogs = async () => {
//     try {
//         const response = await fetch(`${API_BASE}/logs`);
//         if (!response.ok) throw new Error('Failed to fetch logs');
//         allLogsCache = await response.json();
        
//         // Refresh visible elements using new cache information
//         updateLogsDisplay();
//     } catch (error) {
//         console.error('Error in fetchLogs:', error);
//     }
// };

// // Handles processing filter and rendering state updates
// const updateLogsDisplay = () => {
//     const tbody = document.querySelector('#logsTable tbody');
//     const tableElement = document.querySelector('#logsTable');
//     const placeholder = document.getElementById('logsPlaceholder');
//     const header = document.getElementById('logsHeader');

//     // Case 1: No module selected yet
//     if (!selectedDeviceId) {
//         tableElement.classList.add('hidden');
//         placeholder.classList.remove('hidden');
//         header.textContent = 'Telemetry Logs';
//         return;
//     }

//     // Case 2: Target selected, apply isolation filter
//     header.textContent = `Telemetry Logs for ${selectedDeviceId}`;
//     const filteredLogs = allLogsCache.filter(log => log.device_id === selectedDeviceId);

//     tbody.innerHTML = '';

//     if (filteredLogs.length === 0) {
//         tableElement.classList.add('hidden');
//         placeholder.classList.remove('hidden');
//         placeholder.textContent = `No data packets found recorded for ${selectedDeviceId}.`;
//         return;
//     }

//     // Unhide the actual table structure
//     placeholder.classList.add('hidden');
//     tableElement.classList.remove('hidden');

//     filteredLogs.forEach(log => {
//         const row = document.createElement('tr');
//         row.innerHTML = `
//             <td><strong>${log.device_id}</strong></td>
//             <td>${log.latitude || '0.0'}</td>
//             <td>${log.longitude || '0.0'}</td>
//             <td>${formatStringDate(log.timestamp)}</td>
//         `;
//         tbody.appendChild(row);
//     });
// };

// // Core loop execution
// const initDashboard = () => {
//     fetchDevices();
//     fetchLogs();
    
//     // Auto-refresh loops data seamlessly every 5 seconds without changing user choice
//     setInterval(() => {
//         fetchDevices();
//         fetchLogs();
//     }, 5000);
// };

// document.addEventListener('DOMContentLoaded', initDashboard);


const API_BASE = '/api';

let selectedDeviceId = null;
let allLogsCache = [];

const fetchDevices = async () => {
    try {
        const response = await fetch(`${API_BASE}/devices`);
        if (!response.ok) throw new Error('Failed to fetch devices');
        const devices = await response.json();
        
        const tbody = document.querySelector('#devicesTable tbody');
        tbody.innerHTML = '';
        
        devices.forEach(device => {
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
                updateLogsDisplay();
            });

            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error in fetchDevices:', error);
    }
};

const fetchLogs = async () => {
    try {
        const response = await fetch(`${API_BASE}/logs`);
        if (!response.ok) throw new Error('Failed to fetch logs');
        allLogsCache = await response.json();
        updateLogsDisplay();
    } catch (error) {
        console.error('Error in fetchLogs:', error);
    }
};

const updateLogsDisplay = () => {
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
        
        // Handle Map Link building
        let mapLinkContent = 'N/A';
        if (log.maplink) {
            mapLinkContent = `<a href="${log.maplink}" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 500;">Open Map ↗</a>`;
        }

        row.innerHTML = `
            <td><strong>${log.device_id}</strong></td>
            <td>${log.latitude || '0.0'}</td>
            <td>${log.longitude || '0.0'}</td>
            <td>${log.altitude || '0'}</td>
            <td>${log.timestamp || 'N/A'}</td>
            <td>${mapLinkContent}</td>
        `;
        tbody.appendChild(row);
    });
};

const initDashboard = () => {
    fetchDevices();
    fetchLogs();
    
    setInterval(() => {
        fetchDevices();
        fetchLogs();
    }, 5000);
};

document.addEventListener('DOMContentLoaded', initDashboard);