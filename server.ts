import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { processIndicators } from "./src/lib/indicators";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
  });
}

const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Background Scanner Logic
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
  
  const runScanner = async () => {
    try {
      console.log("Running background scanner...");
      const usersSnap = await db.collection("settings").where("autoScan", "==", true).get();
      
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
              sensitivity: settings.sensitivity || 7,
              multiplier: settings.multiplier || 4.3,
              useFilter: settings.useFilter || false,
              rsiHistLength: 16,
              rsiHistMALength: 7,
              rsiHistMAType: 'KAMA'
            });

            const last = results[results.length - 1];
            const prev = results[results.length - 2];

            let signalType = "";
            if (last.buySignal && !prev.buySignal) signalType = "BUY";
            if (last.sellSignal && !prev.sellSignal) signalType = "SELL";

            if (signalType) {
              const alertId = `${symbol}-${last.time}-${userDoc.id}`;
              const alertRef = db.collection("alerts").doc(alertId);
              const alertDoc = await alertRef.get();

              if (!alertDoc.exists) {
                // Send Telegram
                const message = `🚀 <b>Server Alert: ${symbol}.P</b>\nType: ${signalType}\nTime: ${new Date(last.time).toLocaleTimeString()}\nSignal confirmed by 24/7 Scanner.`;
                
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
