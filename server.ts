import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { processIndicators } from "./src/lib/indicators";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initializeApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  collection, 
  getDocs,
  query,
  doc,
  setDoc,
  getDoc
} from "firebase/firestore";

// Initialize Firebase
let db: any;
let firebaseConfig: any;

try {
  const configPath = path.join(__dirname, "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const app = initializeApp(firebaseConfig);
    db = getClientFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log(`Firebase: Client SDK initialized for scanner on project ${firebaseConfig.projectId}`);
  }
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Background Scanner Logic
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'CRVUSDT', 'SUSHIUSDT'];
  
  const runScanner = async () => {
    if (!db) {
      console.error("Scanner: db not initialized, skipping scan.");
      return;
    }

    try {
      console.log(`Scanner: [${new Date().toLocaleTimeString()}] Querying Firestore (Client SDK)...`);
      let usersSnap;
      try {
        usersSnap = await getDocs(collection(db, "settings"));
      } catch (innerError: any) {
        console.error("Scanner: Firestore Fetch Failed (Client SDK):", innerError);
        return;
      }
      
      if (usersSnap.empty) {
        return;
      }
      
      const activeUsers = usersSnap.docs.filter((doc: any) => doc.data().autoScan === true);
      if (activeUsers.length === 0) return;

      console.log(`Scanner: Analyzing ${activeUsers.length} user(s) with autoScan enabled.`);
      for (const userDoc of activeUsers) {
        const settings = userDoc.data();
        if (!settings.telegramEnabled || !settings.telegramToken || !settings.telegramChatId) continue;

        for (const symbol of SYMBOLS) {
          try {
            // Use fapi (Futures) consistent with the frontend
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=15m&limit=100`;
            const response = await fetch(url);
            
            if (!response.ok) {
              console.error(`Scanner: Failed to fetch ${symbol} from Binance Futures API`);
              continue;
            }

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

            // We check the LAST COMPLETED candle (index results.length - 2) 
            // and the CURRENT candle (index results.length - 1)
            // Most traders alert on the CLOSED candle to avoid repainting
            const last = results[results.length - 2]; 
            
            if (!last) continue;

            let signalType = "";
            let signalSource = "Triple Confirmation Strategy";
            
            if (last.buySignal) {
              signalType = "BUY";
            } else if (last.sellSignal) {
              signalType = "SELL";
            }

            if (signalType) {
              // Unique ID per signal per candle per user to prevent duplicates
              const alertId = `${symbol}-${last.time}-${userDoc.id}-${signalType}`;
              const alertRef = doc(db, "alerts", alertId);
              const alertSnap = await getDoc(alertRef);

              if (!alertSnap.exists()) {
                console.log(`Scanner: [SIGNAL] ${signalType} detected for ${symbol}`);
                
                const emoji = signalType === "BUY" ? "🟢" : "🔴";
                const message = `🔔 <b>NEW SIGNAL: ${symbol}</b>\n` +
                                `Type: <b>${signalType} ${emoji}</b>\n` +
                                `Price: <b>${last.close}</b>\n` +
                                `Time: <b>15M Chart</b>`;
                
                await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: settings.telegramChatId,
                    text: message,
                    parse_mode: "HTML"
                  })
                });

                await setDoc(alertRef, {
                  id: alertId,
                  symbol,
                  type: signalType,
                  price: last.close,
                  time: last.time,
                  uid: userDoc.id,
                  sentAt: Date.now()
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
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol as string)}&interval=${interval}&limit=${limit || 500}`;
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
    
    // Run scanner every 1 minute for prompt alerts
    setInterval(runScanner, 1 * 60 * 1000);
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
