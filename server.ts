import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { processIndicators } from "./src/lib/indicators";

import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

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
  } else {
    // Railway/Production Fallback
    firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID
    };
  }

  if (firebaseConfig && (firebaseConfig.apiKey || firebaseConfig.projectId)) {
    const app = initializeApp(firebaseConfig);
    db = getClientFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
    console.log(`Firebase: Client SDK initialized for scanner on project ${firebaseConfig.projectId}`);
  } else {
    console.error("Firebase: Configuration is missing (no file or env vars). Scanner will not run.");
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
      const response = await fetch(url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        } 
      });
      if (!response.ok) {
        if (response.status === 429 && retries > 0) {
          const wait = (parseInt(response.headers.get('Retry-After') || '0') * 1000) || backoff;
          await new Promise(r => setTimeout(r, wait));
          return fetchWithRetry(url, retries - 1, backoff * 2);
        }
        if (response.status === 451) {
          // Blocked region
          throw new Error("Binance Blocked: 451 (Likely US Region)");
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
        'https://fapi2.binance.com',
        'https://fapi3.binance.com'
      ];
      
      let exchangeData: any = null;
      for (const base of endpoints) {
        try {
          const exchangeRes = await fetch(`${base}/fapi/v1/exchangeInfo`, {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            }
          });
          if (exchangeRes.ok) {
            const text = await exchangeRes.text();
            try {
              exchangeData = JSON.parse(text);
              break;
            } catch (jsE) {
              console.error(`Scanner: JSON Parse error from ${base}:`, text.substring(0, 100));
            }
          } else {
            console.warn(`Scanner: ${base} returned status ${exchangeRes.status}`);
          }
        } catch (e) {
          console.warn(`Background Scanner: Fetch failed via ${base}`);
        }
      }

      if (!exchangeData) {
        console.error("Scanner: Could not fetch exchangeInfo from any endpoint");
        return;
      }

      const allSymbols = exchangeData.symbols
        .filter((s: any) => 
          s.quoteAsset === 'USDT' && 
          s.status === 'TRADING' && 
          !['USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'BUSDUSDT', 'DAIUSDT'].includes(s.symbol)
        )
        .map((s: any) => s.symbol);

      // 2. Fetch active users
      let usersSnap;
      try {
        usersSnap = await getDocs(collection(db, "settings"));
      } catch (innerError: any) {
        console.error("Scanner: Firestore Fetch Failed:", innerError);
        return;
      }

      const activeUsers = usersSnap.docs.filter((doc: any) => {
        const data = doc.data();
        return data.autoScan === true && data.telegramEnabled === true && data.telegramToken && data.telegramChatId;
      });
      const activeUsersCount = activeUsers.length;
      console.log(`Scanner: [${new Date().toLocaleTimeString()}] Analysis started for ${allSymbols.length} symbols. Active Users: ${activeUsersCount}`);
      
      if (activeUsersCount === 0) return;

      const timeframes = [...new Set(activeUsers.map(u => u.data().timeframe || '15m'))];
      let totalSignalsFound = 0;

      for (const tf of timeframes) {
        console.log(`Scanner: Processing timeframe ${tf}...`);
        
        const usersInTf = activeUsers.filter(u => (u.data().timeframe || '15m') === tf);
        
        const batchSize = 10;
        for (let i = 0; i < allSymbols.length; i += batchSize) {
          const batch = allSymbols.slice(i, i + batchSize);
          await Promise.all(batch.map(async (symbol) => {
            try {
              let data: any = null;
              for (const base of endpoints) {
                try {
                  data = await fetchWithRetry(`${base}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=500`);
                  if (data && Array.isArray(data)) break;
                } catch (e) {}
              }

              if (!data) return;
              const candles = data.map((d: any) => ({
                time: d[0],
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5])
              }));

              for (const userDoc of usersInTf) {
                const settings = userDoc.data();
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
                    console.log(`Scanner: Debugging Alert Data:`, JSON.stringify(last));
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('en-GB');
                    const dateStr = now.toLocaleDateString('en-GB');
                    const emoji = signalType === "BUY" ? "🟢" : "🔴";

                    const message = `🚀 <b>Signal Alert:</b> <code>${symbol}.P</code>\n` +
                                    `Type: <code>${signalType} ${emoji}</code>\n` +
                                    `Timeframe: <code>${tf}</code>\n` +
                                    `Entry Price: <code>${last.close}</code>\n` +
                                    `Take Profit: <code>${last.tpPrice ? Number(last.tpPrice).toFixed(4) : '---'}</code>\n` +
                                    `Stop Loss: <code>${last.slPrice ? Number(last.slPrice).toFixed(4) : '---'}</code>\n` +
                                    `Time: <code>${timeStr}</code>\n` +
                                    `Date: <code>${dateStr}</code>`;

                    const telegramUrl = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;
                    const telController = new AbortController();
                    const telTimeout = setTimeout(() => telController.abort(), 10000);

                    try {
                      await fetch(telegramUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          chat_id: settings.telegramChatId,
                          text: message,
                          parse_mode: "HTML"
                        }),
                        signal: telController.signal
                      });
                      totalSignalsFound++;
                      console.log(`Scanner: [SIGNAL SENT] ${symbol} ${signalType} ${tf} to User ${userDoc.id}`);
                    } catch (err) {
                      console.error(`Scanner: Telegram Fail for ${symbol}:`, err);
                    } finally {
                      clearTimeout(telTimeout);
                    }

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
            } catch (e) {}
          }));
          await new Promise(r => setTimeout(r, 500)); // Reduced batch pause
        }
      }

      if (totalSignalsFound > 0) {
        console.log(`Scanner: [FINISH] Detected ${totalSignalsFound} new signals across ${timeframes.length} timeframes.`);
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
    const endpoints = [
      'https://fapi.binance.com',
      'https://fapi1.binance.com',
      'https://fapi2.binance.com',
      'https://fapi3.binance.com'
    ];
    
    let lastError = "Failed to fetch exchange info from all Binance endpoints";
    for (const base of endpoints) {
      try {
        const response = await fetch(`${base}/fapi/v1/exchangeInfo`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (response.ok) {
          const data = await response.json();
          return res.json(data);
        }
        lastError = `Binance Proxy Error (${response.status}): ${await response.text()}`;
      } catch (error: any) {
        lastError = error.message;
        console.error(`ExchangeInfo Proxy Attempt Fail via ${base}:`, lastError);
      }
    }
    res.status(500).json({ error: lastError });
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
