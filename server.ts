import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { processIndicators } from "./src/lib/indicators";
import crypto from "crypto";

import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initializeApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  initializeFirestore,
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
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId || "(default)");
    console.log(`Firebase: Client SDK initialized with Long Polling for scanner on project ${firebaseConfig.projectId}`);
  } else {
    console.error("Firebase: Configuration is missing (no file or env vars). Scanner will not run.");
  }
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

let cachedServerIp: string | null = null;
let lastIpFetch = 0;
const IP_CACHE_TTL = 3600000; // 1 hour

async function getServerIp() {
  if (cachedServerIp && (Date.now() - lastIpFetch < IP_CACHE_TTL)) return cachedServerIp;
  
  const providers = ["https://api.ipify.org?format=json", "https://ifconfig.me/all.json"];
  for (const url of providers) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const ip = data.ip || data.ip_addr;
        if (ip) {
          cachedServerIp = ip;
          lastIpFetch = Date.now();
          return ip;
        }
      }
    } catch (e) {}
  }
  return "Unknown";
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Background Scanner Logic
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'CRVUSDT', 'SUSHIUSDT'];
  const BINANCE_ENDPOINTS = [
    'https://fapi.binance.com',
    'https://fapi1.binance.com',
    'https://fapi2.binance.com',
    'https://fapi3.binance.com',
    'https://fapi4.binance.com',
    'https://fapi5.binance.com'
  ];

  // Simple In-Memory Cache to prevent constant fetching from Binance
  let cachedExchangeInfo: any = null;
  let lastExchangeInfoFetch = 0;
  const EXCHANGE_INFO_CACHE_TTL = 30 * 60 * 1000; // 30 mins

  let cachedBtcKlines = new Map<string, { data: any, timestamp: number }>();
  const BTC_KLINES_CACHE_TTL = 60 * 1000; // 1 min

  // Global Helpers for Trading
  const logTradeActivity = async (userId: string, symbol: string, msg: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING') => {
    try {
      const logId = `log-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await setDoc(doc(db, "activity", logId), {
        userId,
        symbol,
        message: msg,
        type,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error("Failed to log activity to Firestore:", e);
    }
  };

  const sign = (queryString: string, apiSecret: string) => crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

  const apiCall = async (path: string, method: string, params: any, apiKey: string, apiSecret: string) => {
    const ts = Date.now();
    const queryString = new URLSearchParams({ ...params, timestamp: ts.toString() }).toString();
    const signature = sign(queryString, apiSecret);
    const url = `https://fapi.binance.com${path}?${queryString}&signature=${signature}`;
    return fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': apiKey }
    }).then(async r => {
      const data = await r.json();
      if (data.code === -2015) {
         const sIp = await getServerIp();
         console.error(`Binance Error: [SECURITY ERROR] Path: ${path}. Msg: ${data.msg}. Ensure IP ${sIp} is whitelisted.`);
      }
      return data;
    });
  };

    const executeBinanceTrade = async (symbol: string, side: "BUY" | "SELL", amount: number, tp: number, sl: number, leverage: number, apiKey: string, apiSecret: string, userId: string) => {
      const buildParams = (p: any) => {
        const out = { ...p };
        if (out.positionSide === "BOTH") delete out.positionSide;
        return out;
      };
      const apiCallInternal = async (path: string, method: string, params: any) => apiCall(path, method, buildParams(params), apiKey, apiSecret);
      const logInternal = async (msg: string, type: any) => logTradeActivity(userId, symbol, msg, type);

      try {
        await logInternal(`Initiating ${side} order for ${symbol}...`, 'INFO');
        const tradeMargin = amount > 0 ? amount : 10;
        
        let finalLeverage = leverage;

        if (leverage === 1) {
          const settingsSnap = await getDoc(doc(db, "settings", userId));
          if (settingsSnap.exists()) {
            const s = settingsSnap.data();
            finalLeverage = s.leverage || 9;
          }
        }

        // 0.1 Get Symbol Rules
        let symInfo: any = null;
        for (const base of BINANCE_ENDPOINTS) {
          try {
            const res = await fetch(`${base}/fapi/v1/exchangeInfo`).then(r => r.json());
            symInfo = res.symbols.find((s: any) => s.symbol === symbol);
            if (symInfo) break;
          } catch (e) {}
        }
        if (!symInfo) throw new Error(`Could not retrieve rules for ${symbol}`);

        const lotFilter = symInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
        const stepSize = parseFloat(lotFilter.stepSize);
        const formatQty = (q: number) => {
          const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
          return q.toFixed(precision);
        };

        // 0. Check for existing position
        const positions = await apiCallInternal("/fapi/v2/positionRisk", "GET", { symbol });
        if (Array.isArray(positions)) {
          const activePos = positions.find(p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
          if (activePos) {
            await logInternal(`Skipped: Position already exists for ${symbol}.`, 'WARNING');
            return;
          }
        }

        // 1. Position side & Margin Mode
        const modeRes = await apiCallInternal("/fapi/v1/positionSide/dual", "GET", {});
        const isHedgeMode = modeRes.dualSidePosition;
        const positionSide = isHedgeMode ? (side === "BUY" ? "LONG" : "SHORT") : "BOTH";

        try {
          await apiCallInternal("/fapi/v1/marginType", "POST", { symbol, marginType: "ISOLATED" });
        } catch (e) {}

        // 2. Leverage Floor (5 USDT min)
        let effectiveLeverage = finalLeverage;
        if ((tradeMargin * effectiveLeverage) < 5.5) {
          effectiveLeverage = Math.ceil(6.0 / tradeMargin);
          if (effectiveLeverage > 100) effectiveLeverage = 100;
        }
        await apiCallInternal("/fapi/v1/leverage", "POST", { symbol, leverage: effectiveLeverage.toString() });

        // 3. Market Order
        const priceRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`).then(r => r.json());
        const currentPrice = parseFloat(priceRes.price);
        
        let qtyValue = (tradeMargin * effectiveLeverage) / currentPrice;
        let qty = formatQty(qtyValue);
        if (parseFloat(qty) * currentPrice < 5.0) {
          qty = formatQty(parseFloat(qty) + stepSize);
        }

        const order = await apiCallInternal("/fapi/v1/order", "POST", {
          symbol, side, positionSide, type: "MARKET", quantity: qty
        });

        if (order.orderId) {
          await logInternal(`SUCCESS: Order ${order.orderId} filled at ${currentPrice}`, 'SUCCESS');
        } else {
          await logInternal(`FAILED: ${order.msg || 'Unknown Error'}`, 'ERROR');
        }
      } catch (err: any) {
        console.error("Trade Execution Error:", err.message);
      }
    };

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
          throw new Error("Binance Blocked: 451 (Likely US Region)");
        }
        const errText = await response.text().catch(() => "Unknown error body");
        throw new Error(`HTTP ${response.status}: ${errText.substring(0, 100)}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        const text = await response.text().catch(() => "");
        throw new Error(`Expected JSON but received ${contentType}. Start: ${text.substring(0, 50)}`);
      }

      try {
        return await response.json();
      } catch (jsonErr: any) {
        throw new Error(`Failed to parse JSON: ${jsonErr.message}`);
      }
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
      // Helper to log scanner behavior to user dashboard
      const logActivity = async (userId: string, symbol: string, msg: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING') => {
        try {
          const logId = `log-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await setDoc(doc(db, "activity", logId), {
            userId,
            symbol,
            message: msg,
            type,
            timestamp: Date.now()
          });
        } catch (e) {
          console.error("Scanner activity log fail:", e);
        }
      };

      // 1. Fetch symbols from Binance (Use multi-endpoint for robustness)
      let exchangeData: any = null;
      for (const base of BINANCE_ENDPOINTS) {
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
        return data.autoScan === true || data.autoTradeEnabled === true;
      });
      const activeUsersCount = activeUsers.length;
      console.log(`Scanner: [${new Date().toLocaleTimeString()}] Analysis started. Active Users: ${activeUsersCount}`);
      
      if (activeUsersCount === 0) {
        console.log("Scanner: No active users with autoScan or autoTrade enabled. Skipping.");
        return;
      }

      const timeframes = [...new Set(activeUsers.map(u => u.data().timeframe || '5m'))];
      let totalSignalsFound = 0;

      for (const tf of timeframes) {
        console.log(`Scanner: Processing timeframe ${tf}...`);
        
        // 1. Get BTC Trend for this timeframe as market context
        let btcTrend = "UNKNOWN ⚪";
        try {
          let btcRaw: any = null;
          
          // Check cache first (always use 1H for context as per Default Setting)
          const btcTf = '1h';
          const cacheKey = `BTCUSDT-${btcTf}`;
          const cached = cachedBtcKlines.get(cacheKey);
          if (cached && (Date.now() - cached.timestamp < BTC_KLINES_CACHE_TTL)) {
            btcRaw = cached.data;
          } else {
            for (const base of BINANCE_ENDPOINTS) {
              try {
                const res = await fetchWithRetry(`${base}/fapi/v1/klines?symbol=BTCUSDT&interval=${btcTf}&limit=100`);
                if (res && Array.isArray(res)) {
                  btcRaw = res;
                  // Update cache for other requests too
                  cachedBtcKlines.set(cacheKey, { data: res, timestamp: Date.now() });
                  break;
                }
              } catch (e) {}
            }
          }

          if (btcRaw) {
            const btcCandles = btcRaw.map((d: any) => ({
              time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
            }));
            const btcResults = processIndicators(btcCandles, {
              bw: 30,                
              alpha: 1.0,
              period: 20,
              phase: 2,
              filter: 'Smooth',
              baseMult: 1.0,
              spacingMode: 'Linear',
              sigmaWindow: 100,
              useConfluence: true,
              warmupBars: 3,
              cooldownGap: 8,
              signalMode: 'Confirmed',
              slPnL: 0.10,
              tpPnL: 0.30,
              tradeAmount: 0.9,
              leverage: 9
            });
            // Use the last candle (can be live) for BTC Market context to be reactive like UI
            const lastBtc = btcResults[btcResults.length - 1]; 
            let btcSignalTime = 0;
            if (lastBtc) {
              btcTrend = lastBtc.trend === "BULLISH" ? "BULLISH 🟢" : "BEARISH 🔴";
              // Find the start of the current trend to use as a baseline for coin signals
              for (let j = btcResults.length - 1; j >= 1; j--) {
                if (btcResults[j].trend !== btcResults[j - 1].trend) {
                  btcSignalTime = btcResults[j].time;
                  break;
                }
              }
              if (btcSignalTime === 0 && btcResults.length > 0) btcSignalTime = btcResults[0].time;
              
              // Store BTC Trend Info in a way the scanner loop can use
              (global as any).btcTrendInfo = { trend: lastBtc.trend, signalTime: btcSignalTime };
            }
          }
        } catch (err) {
          console.error("Scanner: Failed to fetch BTC Trend context:", err);
        }

        const usersInTf = activeUsers.filter(u => (u.data().timeframe || '5m') === tf);
        
        const batchSize = 15;
        for (let i = 0; i < allSymbols.length; i += batchSize) {
          const batch = allSymbols.slice(i, i + batchSize);
          await Promise.all(batch.map(async (symbol) => {
            try {
              let data: any = null;
              for (const base of BINANCE_ENDPOINTS) {
                try {
                  data = await fetchWithRetry(`${base}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=500`);
                  if (data && Array.isArray(data)) break;
                } catch (e) {}
              }

              if (!data || !Array.isArray(data) || data.length < 50) return;

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
                  bw: settings.bw || 30,
                  alpha: settings.alpha !== undefined ? settings.alpha : 1.0,
                  period: settings.period || 20,
                  phase: settings.phase !== undefined ? settings.phase : 2,
                  filter: settings.filter || 'Smooth',
                  baseMult: settings.baseMult !== undefined ? settings.baseMult : 1.0,
                  spacingMode: settings.spacingMode || 'Linear',
                  sigmaWindow: settings.sigmaWindow || 100,
                  useConfluence: settings.useConfluence !== undefined ? settings.useConfluence : true,
                  warmupBars: settings.warmupBars || 3,
                  cooldownGap: settings.cooldownGap || 8,
                  signalMode: settings.signalMode || 'Confirmed',
                  slPnL: settings.slPct || 0.10,
                  tpPnL: settings.tpPct || 0.30,
                  tradeAmount: settings.tradeAmount || 0.9,
                  leverage: settings.leverage || 9
                });

                // User requirement: Signal must be FIRST after 1H BTC Signal
                // and within LAST 10 CANDLES of the current timeframe.
                const now = Date.now();
                const timeframeToMs: Record<string, number> = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 };
                const tfMs = timeframeToMs[tf as string] || 300000;
                
                const btcInfo = (global as any).btcTrendInfo || { trend: "UNKNOWN", signalTime: 0 };
                const signalMaxAgeMs = tfMs * 30;
                const signalAgeLimit = now - signalMaxAgeMs;

                let foundValidSignal = null;

                // Find a valid recent signal
                for (let i = results.length - 2; i >= 0; i--) {
                  const candle = results[i];
                  
                  if (candle.buySignal || candle.sellSignal) {
                    const signalType = candle.buySignal ? "BUY" : "SELL";
                    
                    // Apply Filter: Within last 30 candles
                    const isRecent = candle.time >= signalAgeLimit;
                    
                    // Apply Filter: Match BTC Market Context if available
                    const matchesBtc = btcInfo.trend === "UNKNOWN" || signalType === btcInfo.trend;
                    // Apply Filter: Must be after/on the same candle as the market trend established
                    const afterBtcFlip = btcInfo.signalTime === 0 || candle.time >= btcInfo.signalTime;

                    if (isRecent && matchesBtc && afterBtcFlip) {
                      foundValidSignal = { candle, type: signalType };
                      break; // Capture most recent valid signal
                    }
                  }
                  
                  // Performance: only check back 40 candles
                  if (results.length - i > 40) break;
                }

                // Heartbeat log every 10 mins to show scanner is alive
                const lastHeartbeat = (global as any).lastScannerHeartbeat || {};
                const userLast = lastHeartbeat[userDoc.id] || 0;
                if (now - userLast > 10 * 60 * 1000) {
                  logActivity(userDoc.id, "SYSTEM", `Heartbeat: Scanner is actively monitoring ${allSymbols.length} USDT symbols on ${tf} timeframe.`, 'INFO');
                  if (!(global as any).lastScannerHeartbeat) (global as any).lastScannerHeartbeat = {};
                  (global as any).lastScannerHeartbeat[userDoc.id] = now;
                }

                if (foundValidSignal) {
                  const { candle, type: signalType } = foundValidSignal;
                  const alertId = `${symbol}-${candle.time}-${userDoc.id}-${signalType}`;
                  const alertRef = doc(db, "alerts", alertId);
                  const alertSnap = await getDoc(alertRef);

                  if (!alertSnap.exists()) {
                    console.log(`Scanner: Debugging Alert Data:`, JSON.stringify(candle));
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('en-GB');
                    const dateStr = now.toLocaleDateString('en-GB');
                    const emoji = signalType === "BUY" ? "🟢" : "🔴";

                    const message = `🚀 <b>Signal Alert: ${symbol}</b>\n\n` +
                                    `COPY COIN: <code>${symbol}</code>\n\n` +
                                    `Type: <code>${signalType} ${emoji}</code>\n` +
                                    `Timeframe: <code>${tf}</code>\n` +
                                    `Symbol Trend: <code>${candle.trend} ${candle.trend === 'BULLISH' ? '🟢' : '🔴'}</code>\n\n` +
                                    `Entry Price: <code>${candle.close}</code>\n` +
                                    `Take Profit: <code>${candle.tpPrice ? Number(candle.tpPrice).toFixed(4) : '---'}</code>\n` +
                                    `Stop Loss: <code>${candle.slPrice ? Number(candle.slPrice).toFixed(4) : '---'}</code>\n` +
                                    `Recommended Leverage: <code>${candle.recommendedLeverage || '7'}x</code>\n\n` +
                                    `Time: <code>${timeStr}</code>\n` +
                                    `Date: <code>${dateStr}</code>\n` +
                                    `Chart: <a href="https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}PERP">Open in TradingView</a>\n` +
                                    `Message: Artemis Signal Confirmed ✅`;

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
                      price: candle.close,
                      time: candle.time,
                      uid: userDoc.id,
                      sentAt: Date.now()
                    });

                    // EXECUTE AUTO-TRADE
                    if (settings.autoTradeEnabled && settings.binanceKey && settings.binanceSecret) {
                      console.log(`AutoTrade: Initiating trade for User ${userDoc.id} on ${symbol}`);
                      executeBinanceTrade(
                        symbol, 
                        signalType as "BUY" | "SELL", 
                        settings.tradeAmount || 10, 
                        candle.tpPrice, 
                        candle.slPrice, 
                        settings.leverage || candle.recommendedLeverage || 9, 
                        settings.binanceKey, 
                        settings.binanceSecret,
                        userDoc.id
                      );
                    }
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
      if (!response.ok) {
        return res.status(response.status).json({ 
          error: data.description || `Telegram Error (${response.status})`,
          details: data 
        });
      }
      res.json(data);
    } catch (error: any) {
      clearTimeout(timeout);
      console.error("Telegram Proxy Error:", error.name === 'AbortError' ? 'Request Timed Out' : error.message);
      res.status(500).json({ error: error.name === 'AbortError' ? "Telegram API timeout" : "Failed to send Telegram message" });
    }
  });

  // Binance Connection Check Proxy
  app.post("/api/binance/check", async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "API Key and Secret are required" });
    }

    try {
      const baseUrl = "https://fapi.binance.com";
      const sign = (queryString: string) => crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
      const ts = Date.now();
      const queryString = `timestamp=${ts}`;
      const signature = sign(queryString);
      const url = `${baseUrl}/fapi/v2/account?${queryString}&signature=${signature}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-MBX-APIKEY': apiKey }
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ 
          error: data.msg || `Binance Error (${response.status})`,
          details: data 
        });
      }
      res.json({ 
        success: true, 
        accountType: data.accountType, 
        canTrade: data.canTrade,
        canWithdraw: data.canWithdraw,
        canDeposit: data.canDeposit,
        feeTier: data.feeTier
      });
    } catch (error: any) {
      console.error("Binance Check Error:", error.message);
      res.status(500).json({ error: "Failed to connect to Binance API" });
    }
  });

  // Binance Klines Proxy
  app.get("/api/klines", async (req, res) => {
    const { symbol, interval, limit } = req.query;
    if (!symbol || !interval) {
      return res.status(400).json({ error: "Symbol and interval are required" });
    }

    // Cache optimization for BTC trend (frequently requested by frontend)
    if (symbol === 'BTCUSDT') {
      const cacheKey = `${symbol}-${interval}`;
      const cached = cachedBtcKlines.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < BTC_KLINES_CACHE_TTL)) {
        return res.json(cached.data);
      }
    }

    let lastError: any = null;
    
    for (const base of BINANCE_ENDPOINTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

      try {
        const url = `${base}/fapi/v1/klines?symbol=${encodeURIComponent(symbol as string)}&interval=${interval}&limit=${limit || 500}`;
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text().catch(() => "Unknown body");
          if (response.status === 429) {
            console.error(`Scanner: Rate limited by ${base}`);
            return res.status(429).json({ error: "Binance Rate Limit", details: text });
          }
          lastError = `Binance API error (${response.status}) from ${base}: ${text.substring(0, 100)}`;
          continue; 
        }

        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          lastError = `Expected JSON from ${base} but received ${contentType}`;
          continue;
        }

        try {
          const data = await response.json();
          
          // Cache BTC klines
          if (symbol === 'BTCUSDT') {
            const cacheKey = `${symbol}-${interval}`;
            cachedBtcKlines.set(cacheKey, { data, timestamp: Date.now() });
          }

          return res.json(data);
        } catch (jsonErr: any) {
          lastError = `JSON parse err from ${base}: ${jsonErr.message}`;
          continue;
        }
      } catch (error: any) {
        clearTimeout(timeout);
        lastError = error.name === 'AbortError' ? "Request timed out" : error.message;
        console.error(`Klines Proxy Attempt Fail for ${symbol} via ${base}:`, lastError);
      }
    }

    res.status(500).json({ error: lastError || "Failed to fetch klines from all Binance endpoints" });
  });

  app.get("/api/server-ip", async (req, res) => {
    try {
      const ip = await getServerIp();
      res.json({ ip });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch server IP" });
    }
  });

  app.post("/api/manual-trade", async (req, res) => {
    const { symbol, side, binanceKey, binanceSecret, userId, tradeAmount, leverage } = req.body;
    try {
      console.log(`AutoTrade: Initiating single-step manual trade for User ${userId} on ${symbol}`);
      await executeBinanceTrade(
        symbol,
        side as "BUY" | "SELL",
        parseFloat(tradeAmount || '10'),
        0, // TP Deactivated
        0, // SL Deactivated
        leverage || 1,
        binanceKey,
        binanceSecret,
        userId
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Manual Trade Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Removed /api/manual-tpsl endpoint as automatic close mechanisms are deactivated.

  // Binance Exchange Info Proxy
  app.get("/api/exchangeInfo", async (req, res) => {
    // Check cache
    if (cachedExchangeInfo && (Date.now() - lastExchangeInfoFetch < EXCHANGE_INFO_CACHE_TTL)) {
      return res.json(cachedExchangeInfo);
    }

    let lastError = "Failed to fetch exchange info from all Binance endpoints";
    let lastStatus = 500;

    for (const base of BINANCE_ENDPOINTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const response = await fetch(`${base}/fapi/v1/exchangeInfo`, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            try {
              const data = await response.json();
              // Update cache
              cachedExchangeInfo = data;
              lastExchangeInfoFetch = Date.now();
              return res.json(data);
            } catch (jsonErr: any) {
              lastError = `ExchangeInfo JSON parse fail: ${jsonErr.message}`;
            }
          } else {
            lastError = `ExchangeInfo expected JSON from ${base} but got ${contentType}`;
          }
        } else {
          const text = await response.text().catch(() => "Unknown body");
          lastStatus = response.status;
          lastError = `Binance Proxy Error (${response.status}) from ${base}: ${text.substring(0, 100)}`;
          
          if (response.status === 451 || response.status === 403) {
            console.error(`Scanner: Endpoint ${base} is BLOCKED (Status ${response.status})`);
          }
        }
      } catch (error: any) {
        clearTimeout(timeout);
        lastError = error.name === 'AbortError' ? "Request timed out" : error.message;
        console.error(`ExchangeInfo Proxy Attempt Fail via ${base}:`, lastError);
      }
    }
    res.status(lastStatus).json({ error: lastError });
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
    
    // Schedule scanner aligned with the clock (every 5 mins: :00, :07, :12, :17...)
    const scheduleScanner = () => {
      const now = new Date();
      const m = now.getMinutes();
      
      // Calculate delay to next desired minute
      const targets = [0, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57];
      let target = targets.find(t => t > m);
      if (target === undefined) target = 0; // Wrap around to :00 next hour
      
      let delayMinutes = (target > m ? target - m : (60 - m + target));
      const delay = (delayMinutes * 60 * 1000) - (now.getSeconds() * 1000) - now.getMilliseconds();

      setTimeout(async () => {
        console.log(`Server Scanner: Executing clock-aligned scan at ${new Date().toLocaleTimeString()}`);
        await runScanner();
        scheduleScanner(); // Schedule next
      }, delay);
    };

    // Run immediately on boot
    console.log("Server Scanner: Executing initial scan on boot.");
    runScanner();
    scheduleScanner();
  });
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

startServer();
