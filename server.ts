import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { processIndicators } from "./src/lib/indicators";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Use the firebase-admin SDK properly
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminDb = getFirestore();

import { initializeApp } from "firebase/app";
import { getFirestore as getClientFirestore } from "firebase/firestore";

// Initialize Firebase Client (for proxy or other uses)
const clientApp = initializeApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Background Scanner Logic
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
  
  const runScanner = async () => {
    try {
      console.log(`Scanner: Fetching users with autoScan enabled using Admin SDK...`);
      const usersSnap = await adminDb.collection("settings").where("autoScan", "==", true).get();
      console.log(`Scanner: Found ${usersSnap.size} users with autoScan enabled.`);
      
      for (const userDoc of usersSnap.docs) {
        const settings = userDoc.data();
        if (!settings.telegramEnabled || !settings.telegramToken || !settings.telegramChatId) continue;

        for (const symbol of SYMBOLS) {
          try {
            const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100`);
            const data = await response.json();
            const candles = data.map((d: any) => ({
              time: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5])
            }));

            const results = processIndicators(candles, {
              sensitivity: settings.sensitivity || 20,
              multiplier: settings.multiplier || 3.0,
              useFilter: settings.useFilter || false,
              rsiHistLength: settings.rsiHistLength || 14,
              rsiHistMALength: settings.rsiHistMALength || 14,
              rsiHistMAType: settings.rsiHistMAType || 'JMA',
              kamaAlpha: settings.kamaAlpha || 3,
              rsiSource: settings.rsiSource || 'CLOSE',
              zigzagLength: settings.zigzagLength || 14,
              zigzagPhase: settings.zigzagPhase || 50,
              zigzagPower: settings.zigzagPower || 2,
              tpRatio: settings.tpRatio || 2.0,
              slLookback: settings.slLookback || 3
            });

            const last = results[results.length - 1];
            
            let signalType = "";
            let signalSource = "Combined Strategy";
            
            if (last.buySignal) {
              signalType = "BUY";
            } else if (last.sellSignal) {
              signalType = "SELL";
            }

            if (signalType) {
              const alertId = `${symbol}-${last.time}-${userDoc.id}-${signalSource.replace(/\s+/g, '')}`;
              const alertRef = adminDb.collection("alerts").doc(alertId);
              const alertSnap = await alertRef.get();

              if (!alertSnap.exists) {
                // Send Telegram
                const message = `🚀 <b>Server Alert: ${symbol}.P</b>\nType: ${signalType}\nSource: ${signalSource}\nTime: ${new Date(last.time).toLocaleTimeString()}\nSignal confirmed by 24/7 Scanner.`;
                
                await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: settings.telegramChatId,
                    text: message,
                    parse_mode: "HTML"
                  })
                });

                // Mark as triggered
                await alertRef.set({
                  id: alertId,
                  symbol,
                  type: signalType,
                  timestamp: Date.now(),
                  uid: userDoc.id
                });
              }
            }
          } catch (e) {
            console.error(`Scanner error for ${symbol}:`, e);
          }
        }
      }
    } catch (error) {
      console.error("Global Scanner Error:", error);
    }
  };

  // Telegram Proxy API
  app.post("/api/telegram", async (req, res) => {
    const { token, chatId, text, parseMode } = req.body;

    if (!token || !chatId || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode || "HTML",
        }),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("Telegram Proxy Error:", error);
      res.status(500).json({ error: "Failed to send Telegram message" });
    }
  });

  // Binance Klines Proxy
  app.get("/api/klines", async (req, res) => {
    const { symbol, interval, limit } = req.query;
    if (!symbol || !interval) {
      return res.status(400).json({ error: "Symbol and interval are required" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit || 500}`;
      const response = await fetch(url, { signal: controller.signal });
      
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Binance API error: ${text}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      clearTimeout(timeout);
      console.error(`Klines Proxy Error for ${symbol}:`, error.name === 'AbortError' ? 'Request timed out' : error.message);
      res.status(500).json({ 
        error: error.name === 'AbortError' ? "Request timed out" : "Failed to fetch klines from Binance" 
      });
    }
  });

  // Binance Exchange Info Proxy
  app.get("/api/exchangeInfo", async (req, res) => {
    try {
      const url = `https://fapi.binance.com/fapi/v1/exchangeInfo`;
      const response = await fetch(url);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("ExchangeInfo Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch exchange info from Binance" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Run scanner every 5 minutes
    setInterval(runScanner, 5 * 60 * 1000);
    // Run once on start
    runScanner();
  });
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

startServer();
