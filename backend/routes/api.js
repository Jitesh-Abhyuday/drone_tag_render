const express = require('express');
const router = express.Router();
const prisma = require('../db');
const WebSocket = require('ws');

// UPGRADED: Map stores { trackerId => lastSeenEpochTimestamp }
const knownTrackersCache = new Map();

// POST /api/data - Hardware telemetry collector
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

    // Step 1: Optimized Device existence check using updated Map memory cache
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
    }
    
    // CRITICAL: Update/Insert the live tracking epoch runtime marker into RAM cache
    const currentEpoch = Date.now();
    knownTrackersCache.set(cleanTrackerId, currentEpoch);

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

    // Step 3: Broadcast packet along with its real-time last_seen timestamp
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            event: 'NEW_TELEMETRY', 
            data: log,
            last_seen: currentEpoch 
          }));
        }
      });
    }

    res.status(201).json({ message: 'Telemetry packet logged and broadcasted', data: log });
  } catch (error) {
    console.error('Error recording telemetry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/init-dashboard - Load initial historical state with memory timestamps
router.get('/init-dashboard', async (req, res) => {
  try {
    const [devices, logs] = await Promise.all([
      prisma.devices.findMany({ orderBy: { id: 'desc' } }),
      prisma.logs.findMany({ orderBy: { id: 'desc' }, take: 100 })
    ]);
    
    // Map devices to include their cached uptime metric if present, fallback to converting db logs
    const enhancedDevices = devices.map(device => {
      const dId = String(device.device_id).trim();
      
      // If server doesn't have it cached, look through raw logs to guess last timestamp
      if (!knownTrackersCache.has(dId)) {
        const match = logs.find(l => String(l.device_id).trim() === dId);
        const inferredTime = match ? new Date(match.timestamp).getTime() : new Date(device.created_at).getTime();
        knownTrackersCache.set(dId, inferredTime || Date.now());
      }

      return {
        ...device,
        last_seen: knownTrackersCache.get(dId)
      };
    });

    res.status(200).json({ devices: enhancedDevices, logs });
  } catch (error) {
    console.error('Initial load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/devices/:device_id - Custom cascading wipe out
router.delete('/devices/:device_id', async (req, res) => {
  try {
    const { device_id } = req.params;
    const cleanTrackerId = String(device_id).trim();

    await prisma.devices.delete({ where: { device_id: cleanTrackerId } });
    
    // Clear registration references completely from active RAM track mapping
    knownTrackersCache.delete(cleanTrackerId);

    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: 'DEVICE_DELETED', device_id: cleanTrackerId }));
        }
      });
    }
    res.status(200).json({ message: 'Device purged successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to purge device' });
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

module.exports = router;