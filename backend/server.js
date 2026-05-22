require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSocket Server instance attached to the HTTP Server
const wss = new WebSocket.Server({ server });

// Make the WebSocket Server accessible globally inside our API routes
app.set('wss', wss);

// Handle open browser dashboard connections
wss.on('connection', (ws) => {
  console.log('Dashboard client connected via WebSocket');
  
  ws.on('close', () => {
    console.log('Dashboard client disconnected');
  });
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Serve Static Frontend Files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start the unified Server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});