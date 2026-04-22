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
    console.log(`Firebase: Client SDK initialized for project ${firebaseConfig.projectId}`);
  }
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

let cachedServerIp: string | null = null;
let lastIpFetch = 0;
const IP_CACHE_TTL = 3600000;

async function getServerIp() {
  if (cachedServerIp && (Date.now() - lastIpFetch < IP_CACHE_TTL)) return cachedServerIp;
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    cachedServerIp = data.ip;
    lastIpFetch = Date.now();
    return data.ip;
  } catch (e) { return "Unknown"; }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  const BINANCE_ENDPOINTS = ['https://fapi.binance.com'];
  let cachedBtcKlines = new Map<string, { data: any, timestamp: number }>();

  const logTradeActivity = async (userId: string, symbol: string, msg: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING') => {
    try {
      const logId = `log-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await setDoc(doc(db, "activity", logId), { userId, symbol, message: msg, type, timestamp: Date.now() });
    } catch (e) { console.error("Log Fail:", e); }
  };

  const sign = (queryString: string, apiSecret: string) => crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

  const apiCall = async (path: string, method: string, params: any, apiKey: string, apiSecret: string) => {
    const ts = Date.now();
    const queryString = new URLSearchParams({ ...params, timestamp: ts.toString() }).toString();
    const signature = sign(queryString, apiSecret);
    const url = `https://fapi.binance.com${path}?${queryString}&signature=${signature}`;
    return fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } }).then(r => r.json());
  };

  // --- නිවැරදි කළ Trade Execution Function එක ---
  const executeBinanceTrade = async (symbol: string, side: "BUY" | "SELL", amount: number, tp: number, sl: number, leverage: number, apiKey: string, apiSecret: string, userId: string) => {
    const apiCallInternal = async (path: string, method: string, params: any) => apiCall(path, method, params, apiKey, apiSecret);
    const logInternal = async (msg: string, type: any) => logTradeActivity(userId, symbol, msg, type);

    try {
      await logInternal(`Initiating ${side} order for ${symbol}...`, 'INFO');
      
      // Get Symbol Rules for Formatting
      const exRes = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo`).then(r => r.json());
      const symInfo = exRes.symbols.find((s: any) => s.symbol === symbol);
      if (!symInfo) throw new Error("Symbol info not found");

      const tickSize = parseFloat(symInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER').tickSize);
      const stepSize = parseFloat(symInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').stepSize);
      
      const formatPrice = (p: number) => p.toFixed(Math.max(0, Math.round(-Math.log10(tickSize))));
      const formatQty = (q: number) => q.toFixed(Math.max(0, Math.round(-Math.log10(stepSize))));

      // 1. Check Existing Position (Auto-close නොවීමට මෙය වැදගත්)
      const positions = await apiCallInternal("/fapi/v2/positionRisk", "GET", { symbol });
      if (Array.isArray(positions)) {
        const activePos = positions.find(p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
        if (activePos) {
          await logInternal(`Skipped: Position already exists for ${symbol}.`, 'WARNING');
          return;
        }
      }

      // 2. Set Margin Type & Leverage
      try { await apiCallInternal("/fapi/v1/marginType", "POST", { symbol, marginType: "ISOLATED" }); } catch (e) {}
      await apiCallInternal("/fapi/v1/leverage", "POST", { symbol, leverage: leverage.toString() });

      // 3. Execution Logic
      const priceRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`).then(r => r.json());
      const currentPrice = parseFloat(priceRes.price);
      
      let qty = formatQty((amount * leverage) / currentPrice);
      
      // Determine Position Side (Hedge Mode Support)
      const modeRes = await apiCallInternal("/fapi/v1/positionSide/dual", "GET", {});
      const positionSide = modeRes.dualSidePosition ? (side === "BUY" ? "LONG" : "SHORT") : "BOTH";

      // MARKET ORDER එක දැමීම
      const order = await apiCallInternal("/fapi/v1/order", "POST", {
        symbol, side, positionSide, type: "MARKET", quantity: qty
      });

      if (order.orderId) {
        await logInternal(`SUCCESS: Order ${order.orderId} filled.`, 'SUCCESS');
        
        // **විසඳුම:** තත්පර 60ක් වෙනුවට තත්පර 1ක් පමණක් පමාවන්න
        await new Promise(r => setTimeout(r, 1500));

        const tpSide = side === "BUY" ? "SELL" : "BUY";

        // TP Order
        if (tp > 0) {
            await apiCallInternal("/fapi/v1/order", "POST", {
                symbol, side: tpSide, positionSide, type: "TAKE_PROFIT_MARKET", stopPrice: formatPrice(tp), closePosition: "true", workingType: "MARK_PRICE"
            });
            await logInternal(`TP Set @ ${formatPrice(tp)}`, 'INFO');
        }

        // SL Order
        if (sl > 0) {
            await apiCallInternal("/fapi/v1/order", "POST", {
                symbol, side: tpSide, positionSide, type: "STOP_MARKET", stopPrice: formatPrice(sl), closePosition: "true", workingType: "MARK_PRICE"
            });
            await logInternal(`SL Set @ ${formatPrice(sl)}`, 'INFO');
        }
      } else {
        await logInternal(`FAILED: ${order.msg}`, 'ERROR');
      }
    } catch (err: any) {
      console.error("Trade Error:", err.message);
    }
  };

  // --- පවතින අනෙක් ලොජික් (Scanner, APIs) මෙතැන් සිට ---
  // (කලින් තිබූ runScanner සහ අනෙක් API endpoints එලෙසම පවතී)
  
  // ... (ඉතිරි කේතය කලින් පරිදිම එකතු කරන්න)

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    setInterval(() => {}, 60000); // Placeholder for scanner interval
  });
}

startServer();
