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
  
  const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<any> => {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'MarketPulse-Scanner' } });
      if (!response.ok) {
        if (response.status === 429 && retries > 0) {
          const wait = (parseInt(response.headers.get('Retry-After') || '0') * 1000) || backoff;
          await new Promise(r => setTimeout(r, wait));
          return fetchWithRetry(url, retries - 1, backoff * 2);
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, retries - 1, backoff * 2);
      }
      throw e;
    }
  };

  const runScanner = async () => {
    if (!db) {
      console.error("Scanner: db not initialized, skipping scan.");
      return;
    }

    try {
      // 1. Fetch symbols from Binance (Use multi-endpoint for robustness)
      const endpoints = [
        'https://fapi.binance.com',
        'https://fapi1.binance.com',
        'https://fapi2.binance.com'
      ];
      
      let exchangeData: any = null;
      for (const base of endpoints) {
        try {
          const exchangeRes = await fetch(`${base}/fapi/v1/exchangeInfo`);
          if (exchangeRes.ok) {
            exchangeData = await exchangeRes.json();
            break;
          }
        } catch (e) {}
      }

      if (!exchangeData) {
        console.error("Scanner: Could not fetch exchangeInfo from any endpoint");
        return;
      }

      const allSymbols = exchangeData.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);

      console.log(`Scanner: [${new Date().toLocaleTimeString()}] Analysis started for ${allSymbols.length} symbols.`);
      
      // 2. Fetch active users
      let usersSnap;
      try {
        usersSnap = await getDocs(collection(db, "settings"));
      } catch (innerError: any) {
        console.error("Scanner: Firestore Fetch Failed:", innerError);
        return;
      }
      
      const activeUsers = usersSnap.docs.filter((doc: any) => doc.data().autoScan === true && doc.data().telegramEnabled === true);
      if (activeUsers.length === 0) {
        console.log("Scanner: No active users with autoScan and Telegram enabled.");
        return;
      }

      // 3. Process symbols in small batches to respect Binance limits and CPU
      const batchSize = 5; // Smaller batches for background scanner
      for (let i = 0; i < allSymbols.length; i += batchSize) {
        const batch = allSymbols.slice(i, i + batchSize);
        await Promise.all(batch.map(async (symbol) => {
          try {
            const data = await fetchWithRetry(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=15m&limit=100`);
            
            const candles = data.map((d: any) => ({
              time: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5])
            }));

            // For each user, check their specific indicator settings
            for (const userDoc of activeUsers) {
              const settings = userDoc.data();
              if (!settings.telegramToken || !settings.telegramChatId) continue;

              const results = processIndicators(candles, {
                sensitivity: settings.sensitivity || 20,
                multiplier: settings.multiplier || 3.0,
                useFilter: settings.useFilter || false,
                rsiHistLength: settings.rsiHistLength || 14,
                rsiHistMALength: settings.rsiHistMALength || 14,
                rsiHistMAType: settings.rsiHistMAType || 'JMA',
                zigzagLength: settings.zigzagLength || 14,
                tpRatio: settings.tpRatio || 2.0,
                slLookback: settings.slLookback || 3
              });

              // Check the last closed candle
              const last = results[results.length - 2];
              if (!last) continue;

              const isBuy = last.buySignal;
              const isSell = last.sellSignal;
              const signalType = isBuy ? "BUY" : (isSell ? "SELL" : "");

              if (signalType) {
                const alertId = `${symbol}-${last.time}-${userDoc.id}-${signalType}`;
                const alertRef = doc(db, "alerts", alertId);
                const alertSnap = await getDoc(alertRef);

                if (!alertSnap.exists()) {
                  console.log(`Scanner: [SIGNAL] ${signalType} for ${symbol} (User: ${userDoc.id})`);
                  const emoji = signalType === "BUY" ? "🟢" : "🔴";
                  const message = `🔔 <b>NEW TRIPLE CONFIRMATION SIGNAL</b>\n\n` +
                                  `Coin: <b>${symbol}.P</b>\n` +
                                  `Action: <b>${signalType} ${emoji}</b>\n` +
                                  `Price: <b>$${last.close}</b>\n` +
                                  `TF: <b>15M (Automated)</b>\n\n` +
                                  `TP (1:2): <b>$${last.tpPrice?.toFixed(settings.pricePrecision || 4)}</b>\n` +
                                  `SL: <b>$${last.slPrice?.toFixed(settings.pricePrecision || 4)}</b>`;

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
            }
          } catch (e) {
            // Quietly skip single symbol errors
          }
        }));
        // Pause between batches to respect Binance limits and reduce local CPU load
        await new Promise(r => setTimeout(r, 1000));
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout for Telegram

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
        signal: controller.signal
      });

      clearTimeout(timeout);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      clearTimeout(timeout);
      console.error("Telegram Proxy Error:", error.name === 'AbortError' ? 'Request Timed Out' : error.message);
      res.status(500).json({ error: error.name === 'AbortError' ? "Telegram API timeout" : "Failed to send Telegram message" });
    }
  });

  // Binance Klines Proxy
  app.get("/api/klines", async (req, res) => {
    const { symbol, interval, limit } = req.query;
    if (!symbol || !interval) {
      return res.status(400).json({ error: "Symbol and interval are required" });
    }

    const endpoints = [
      'https://fapi.binance.com',
      'https://fapi1.binance.com',
      'https://fapi2.binance.com',
      'https://fapi3.binance.com'
    ];

    let lastError: any = null;
    
    for (const base of endpoints) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // Increased 15s timeout

      try {
        const url = `${base}/fapi/v1/klines?symbol=${encodeURIComponent(symbol as string)}&interval=${interval}&limit=${limit || 500}`;
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          // If rate limited, don't try other endpoints, just return the 429
          if (response.status === 429) {
            return res.status(429).json({ error: "Binance Rate Limit", details: text });
          }
          lastError = `Binance API error (${response.status}): ${text}`;
          continue; // Try next endpoint
        }

        const data = await response.json();
        return res.json(data);
      } catch (error: any) {
        clearTimeout(timeout);
        lastError = error.name === 'AbortError' ? "Request timed out" : error.message;
        console.error(`Klines Proxy Attempt Fail for ${symbol} via ${base}:`, lastError);
      }
    }

    res.status(500).json({ error: lastError || "Failed to fetch klines from all Binance endpoints" });
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
