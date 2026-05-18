const express = require('express');
const router = express.Router();
const prisma = require('../db');

// POST /api/data - Receive IoT data matching your VARCHAR schema
router.post('/data', async (req, res) => {
  try {
    const { device_id, latitude, longitude, timestamp } = req.body;

    if (!device_id || latitude === undefined || longitude === undefined || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Sanitize inputs to prevent trailing whitespace mismatch bugs
    const cleanDeviceId = String(device_id).trim();
    const cleanLat = String(latitude).trim();
    const cleanLng = String(longitude).trim();
    const cleanTime = String(timestamp).trim();

    // Check if device exists using your exact table model
    let device = await prisma.devices.findUnique({
      where: { device_id: cleanDeviceId }
    });

    // Auto-register if it doesn't exist
    if (!device) {
      device = await prisma.devices.create({
        data: {
          device_id: cleanDeviceId,
          created_at: cleanTime
        }
      });
    }

    // Insert log entry using your VARCHAR layout
    const log = await prisma.logs.create({
      data: {
        device_id: cleanDeviceId,
        latitude: cleanLat,
        longitude: cleanLng,
        timestamp: cleanTime
      }
    });

    res.status(201).json({ message: 'Data logged successfully', data: log });
  } catch (error) {
    console.error('Error processing /api/data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices - List all devices
router.get('/devices', async (req, res) => {
  try {
    const allDevices = await prisma.devices.findMany({
      orderBy: { id: 'desc' }
    });
    res.status(200).json(allDevices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/logs - List logs ordered newest first
router.get('/logs', async (req, res) => {
  try {
    const allLogs = await prisma.logs.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100 // Keep it snappy
    });
    res.status(200).json(allLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cache/disconnect gracefully if needed
module.exports = router;