const API_BASE = '/api';

// Simple check to make sure string dates look clean
const formatStringDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    // If it's already a formatted string from the hardware (e.g. "2026-05-18 10:00:00"), return it directly
    return dateStr;
};

// Fetch and render devices
const fetchDevices = async () => {
    try {
        const response = await fetch(`${API_BASE}/devices`);
        if (!response.ok) throw new Error('Network response was not ok');
        const devices = await response.json();
        
        const tbody = document.querySelector('#devicesTable tbody');
        tbody.innerHTML = '';
        
        devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${device.device_id || 'Unknown'}</strong></td>
                <td colspan="2">${formatStringDate(device.created_at)}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to fetch devices:', error);
    }
};

// Fetch and render logs
const fetchLogs = async () => {
    try {
        const response = await fetch(`${API_BASE}/logs`);
        if (!response.ok) throw new Error('Network response was not ok');
        const logs = await response.json();
        
        const tbody = document.querySelector('#logsTable tbody');
        tbody.innerHTML = '';
        
        logs.forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${log.device_id || 'Unknown'}</strong></td>
                <td>${log.latitude || '0.0'}</td>
                <td>${log.longitude || '0.0'}</td>
                <td>${formatStringDate(log.timestamp)}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
};

// Initialize and set interval
const initDashboard = () => {
    fetchDevices();
    fetchLogs();
    
    // Auto-refresh every 5 seconds
    setInterval(() => {
        fetchDevices();
        fetchLogs();
    }, 5000);
};

document.addEventListener('DOMContentLoaded', initDashboard);