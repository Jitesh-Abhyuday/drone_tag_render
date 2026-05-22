const express = require('express');
const router = express.Router();
const prisma = require('../db');
const WebSocket = require('ws');

// In-memory cache to keep track of already registered tracker modules
const knownTrackersCache = new Set();

// POST /api/data - Hardware uploads remain 100% unchanged
router.post('/data', async (req, res) => {
  try {
    const { TrackerID, Latitude, Longitude, Altitude, Timestamp, Maplink } = req.body;

    if (!TrackerID || Latitude === undefined || Longitude === undefined || !Timestamp) {
      return res.status(400).json({ error: 'Missing required tracking fields' });
    }

    const cleanTrackerId = String(TrackerID).trim();
    const cleanLat = String(Latitude).trim();
    const cleanLng = String(Longitude).trim();
    const cleanAlt = Altitude ? String(Altitude).trim() : '0';
    const cleanTime = String(Timestamp).trim();
    const cleanMapLink = Maplink ? String(Maplink).trim() : '';

    // Step 1: Optimized Device check using memory cache
    if (!knownTrackersCache.has(cleanTrackerId)) {
      let device = await prisma.devices.findUnique({
        where: { device_id: cleanTrackerId }
      });

      if (!device) {
        await prisma.devices.create({
          data: {
            device_id: cleanTrackerId,
            created_at: cleanTime
          }
        });
      }
      knownTrackersCache.add(cleanTrackerId);
    }

    // Step 2: Record telemetry log point in database
    const log = await prisma.logs.create({
      data: {
        device_id: cleanTrackerId,
        latitude: cleanLat,
        longitude: cleanLng,
        timestamp: cleanTime,
        altitude: cleanAlt,
        maplink: cleanMapLink
      }
    });

    // Step 3: Broadcast packet to all connected dashboards via WebSockets instantly
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: 'NEW_TELEMETRY', data: log }));
        }
      });
    }

    res.status(201).json({ message: 'Telemetry packet logged and broadcasted', data: log });
  } catch (error) {
    console.error('Error recording telemetry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/init-dashboard - Load initial historical state on page load
router.get('/init-dashboard', async (req, res) => {
  try {
    const [devices, logs] = await Promise.all([
      prisma.devices.findMany({ orderBy: { id: 'desc' } }),
      prisma.logs.findMany({ orderBy: { id: 'desc' }, take: 100 })
    ]);
    
    // Prime our in-memory cache if the server restarts
    devices.forEach(d => knownTrackersCache.add(d.device_id));

    res.status(200).json({ devices, logs });
  } catch (error) {
    console.error('Initial load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/logs/:id - Delete a single specific log entry
router.delete('/logs/:id', async (req, res) => {
  try {
    const logId = parseInt(req.params.id);

    const deletedLog = await prisma.logs.delete({
      where: { id: logId }
    });

    // Notify all dashboard windows to instantly drop this item from RAM cache
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: 'LOG_DELETED', id: logId }));
        }
      });
    }

    res.status(200).json({ message: 'Log cleared successfully' });
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({ error: 'Failed to delete log segment' });
  }
});

// DELETE /api/devices/:device_id - Delete device and cascade all its logs
router.delete('/devices/:device_id', async (req, res) => {
  try {
    const { device_id } = req.params;
    const cleanTrackerId = String(device_id).trim();

    // 1. Wipe it out from the live PostgreSQL database
    await prisma.devices.delete({
      where: { device_id: cleanTrackerId }
    });

    // 2. CRITICAL FIX: Explicitly drop it from the server's Node.js memory cache!
    knownTrackersCache.delete(cleanTrackerId);

    // 3. Notify all open dashboards via WebSockets
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: 'DEVICE_DELETED', device_id: cleanTrackerId }));
        }
      });
    }

    res.status(200).json({ message: 'Device and its cascading trail wiped out successfully' });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to purge fleet device' });
  }
});

module.exports = router;