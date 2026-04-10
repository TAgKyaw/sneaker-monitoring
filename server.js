const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config();

const PORT = process.env.PORT;
const SCAN_INTERVAL = process.env.SCAN_INTERVAL;

// Use process.env.VARIABLE_NAME throughout code

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIG ---
const STORES = [
    { name: 'Working Class Heroes', url: 'https://www.workingclassheroes.co.uk/products.json' },
    { name: 'Flatspot', url: 'https://www.flatspot.com/products.json' },
    { name: 'Route One', url: 'https://www.routeone.co.uk/products.json' },
    { name: 'OG Kicks', url: 'https://ogkicks.uk/products.json' }
];

const TARGET_BRANDS = ['nike', 'vans', 'new balance'];
const REQUEST_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.google.com/'
    }
};

let seenProducts = new Set();
let isScanning = false; // Controlled by the button
let scanTimer = null;

app.use(express.static('public'));

// Helper function to send logs to the UI
function sendLog(message, type = 'info') {
    const logEntry = { text: message, type, time: new Date().toLocaleTimeString() };
    console.log(`[${type.toUpperCase()}] ${message}`);
    io.emit('status-log', logEntry);
}

async function runScan() {
    if (!isScanning) return;

    sendLog("Starting multi-store scan...", "process");
    
    for (const store of STORES) {
        if (!isScanning) break; // Stop immediately if button clicked during loop

        try {
            sendLog(`Requesting data from ${store.name}...`);
            await new Promise(res => setTimeout(res, 1500)); // Polite delay

            const response = await fetch(store.url, REQUEST_CONFIG);
            
            if (!response.ok) {
                sendLog(`Failed: ${store.name} returned ${response.status}`, "error");
                continue;
            }

            const data = await response.json();
            const products = data.products || [];
            let foundInStore = 0;

            products.forEach(product => {
                const title = product.title.toLowerCase();
                const vendor = (product.vendor || "").toLowerCase();
                const isMatch = TARGET_BRANDS.some(b => title.includes(b) || vendor.includes(b));

                if (isMatch && !seenProducts.has(product.id)) {
                    seenProducts.add(product.id);
                    foundInStore++;
                    
                    io.emit('new-product', {
                        store: store.name,
                        title: product.title,
                        brand: product.vendor,
                        price: product.variants[0]?.price || 'N/A',
                        image: product.images[0]?.src,
                        link: `${new URL(store.url).origin}/products/${product.handle}`
                    });
                }
            });

            sendLog(`Check Complete: ${store.name} (${foundInStore} new found)`, "success");

        } catch (err) {
            sendLog(`Error at ${store.name}: ${err.message}`, "error");
        }
    }

    if (isScanning) {
        sendLog("Scan cycle finished. Waiting 2 minutes...", "idle");
        scanTimer = setTimeout(runScan, SCAN_INTERVAL);
    }
}

// Socket Listeners for UI Buttons
io.on('connection', (socket) => {
    sendLog("Dashboard connected.");
    
    socket.on('toggle-monitor', (state) => {
        isScanning = state;
        if (isScanning) {
            sendLog("Monitor Manual Start triggered.", "success");
            runScan();
        } else {
            clearTimeout(scanTimer);
            sendLog("Monitor Manual Stop triggered.", "error");
        }
    });
});

server.listen(PORT, () => console.log('Server running on http://localhost:3000'));