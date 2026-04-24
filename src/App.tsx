/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  AreaChart,
  ComposedChart,
  Scatter,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Settings, 
  RefreshCw,
  Info,
  ArrowUpCircle,
  ArrowDownCircle,
  Zap,
  Search,
  LayoutDashboard,
  ListFilter,
  Target,
  Copy,
  ShieldAlert,
  Check,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  History,
  Send,
  Globe,
  Activity,
  Eye,
  EyeOff,
  Sparkles,
  MessageSquare,
  X,
  Bot,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { processIndicators, Candle } from './lib/indicators';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

import { generateText } from './services/geminiService';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Indicator Settings
  const [bw, setBw] = useState(30);
  const [alpha, setAlpha] = useState(1.0);
  const [period, setPeriod] = useState(20);
  const [phase, setPhase] = useState(2);
  const [filter, setFilter] = useState<'No Filter' | 'Smooth' | 'Zero Lag'>('Smooth');
  const [baseMult, setBaseMult] = useState(1.0);
  const [spacingMode, setSpacingMode] = useState<'Linear' | 'Exponential'>('Linear');
  const [sigmaWindow, setSigmaWindow] = useState(100);
  const [useConfluence, setUseConfluence] = useState(true);
  const [warmupBars, setWarmupBars] = useState(3);
  const [cooldownGap, setCooldownGap] = useState(8);
  const [signalMode, setSignalMode] = useState<'Confirmed' | 'Realtime'>('Confirmed');
  const [slPnL, setSlPnL] = useState(0.10);
  const [tpPnL, setTpPnL] = useState(0.30);
  
  // BTC Trend State
  const [btcTrend, setBtcTrend] = useState<{ trend: string, signalTime: number } | null>(null);
  const [btcTrendLoading, setBtcTrendLoading] = useState(false);

  // Scanner State
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [currentScanning, setCurrentScanning] = useState<string | null>(null);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  // Alert System State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [autoAlert, setAutoAlert] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [scanLookbackMinutes, setScanLookbackMinutes] = useState(30);
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Telegram & Push Settings
  const [telegramEnabled, setTelegramEnabled] = useState(() => localStorage.getItem('telegramEnabled') === 'true');
  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('telegramToken') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('telegramChatId') || '');
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem('pushEnabled') === 'true');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('selectedTimeframe') || '5m');

  // Binance Auto-Trade Settings
  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(0.9); // Fixed $0.90 per trade as requested
  const [maxOpenTrades, setMaxOpenTrades] = useState(3);
  const [leverage, setLeverage] = useState(9);

  // Field Visibility State
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showBinanceKey, setShowBinanceKey] = useState(false);
  const [showBinanceSecret, setShowBinanceSecret] = useState(false);
  const [checkingBinance, setCheckingBinance] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [serverIp, setServerIp] = useState<string>('Loading...');
  const [tradedIds, setTradedIds] = useState<Set<string>>(new Set());

  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiChatHistory, setAiChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);

  // Fetch Server IP
  useEffect(() => {
    fetch('/api/server-ip').then(r => r.json()).then(d => setServerIp(d.ip || 'Unknown')).catch(() => setServerIp('Error'));
  }, []);

  // Sync with Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        // Load settings from Firestore
        const settingsRef = doc(db, 'settings', currentUser.uid);
        getDoc(settingsRef).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.telegramToken) setTelegramToken(data.telegramToken);
            if (data.telegramChatId) setTelegramChatId(data.telegramChatId);
            if (data.telegramEnabled !== undefined) setTelegramEnabled(data.telegramEnabled);
            if (data.autoScan !== undefined) setAutoScan(data.autoScan);
            if (data.soundEnabled !== undefined) setSoundEnabled(data.soundEnabled);
            if (data.timeframe !== undefined) setTimeframe(data.timeframe);
            if (data.bw !== undefined) setBw(data.bw);
            if (data.alpha !== undefined) setAlpha(data.alpha);
            if (data.baseMult !== undefined) setBaseMult(data.baseMult);
            if (data.spacingMode !== undefined) setSpacingMode(data.spacingMode);
            if (data.useConfluence !== undefined) setUseConfluence(data.useConfluence);
            if (data.slPct !== undefined) setSlPnL(data.slPct);
            if (data.tpPct !== undefined) setTpPnL(data.tpPct);
            if (data.binanceKey) setBinanceKey(data.binanceKey);
            if (data.binanceSecret) setBinanceSecret(data.binanceSecret);
            if (data.autoTradeEnabled !== undefined) setAutoTradeEnabled(data.autoTradeEnabled);
            if (data.tradeAmount !== undefined) setTradeAmount(data.tradeAmount);
            if (data.maxOpenTrades !== undefined) setMaxOpenTrades(data.maxOpenTrades);
            if (data.scanLookbackMinutes !== undefined) setScanLookbackMinutes(data.scanLookbackMinutes);
            else if (data.scanLookbackHours !== undefined) setScanLookbackMinutes(data.scanLookbackHours * 60);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for Trade Activity Logs
  useEffect(() => {
    if (!user) {
      setActivityLogs([]);
      return;
    }
    
    const logsRef = collection(db, 'activity');
    const q = query(
      logsRef, 
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(15)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setActivityLogs(logs);
    }, (err) => {
      console.warn("Firestore listener warning (handled):", err.message);
      // Firestore SDK automatically reconnects, so we just log it as a warning
    });

    return () => unsubscribe();
  }, [user]);

  const saveSettingsToFirebase = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        uid: user.uid,
        telegramEnabled,
        telegramToken,
        telegramChatId,
        autoScan,
        soundEnabled,
        timeframe,
        bw,
        alpha,
        period,
        phase,
        filter,
        baseMult,
        spacingMode,
        sigmaWindow,
        useConfluence,
        warmupBars,
        cooldownGap,
        signalMode,
        slPct: slPnL,
        tpPct: tpPnL,
        leverage,
        binanceKey,
        binanceSecret,
        autoTradeEnabled,
        tradeAmount,
        maxOpenTrades,
        scanLookbackMinutes,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  };

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        saveSettingsToFirebase();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    telegramEnabled, telegramToken, telegramChatId, autoScan, soundEnabled, timeframe,
    bw, alpha, baseMult, spacingMode, useConfluence, slPnL, tpPnL, scanLookbackMinutes,
    binanceKey, binanceSecret, autoTradeEnabled, tradeAmount, maxOpenTrades, user
  ]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    setError(null);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error('Login Error:', e);
      if (e.code === 'auth/network-request-failed') {
        setError('Network Error: The connection to Google Login was blocked. Please follow these steps:\n1. Disable Ad-blockers (e.g., uBlock, AdBlock).\n2. Allow popups for this site.\n3. Check your internet connection.\n4. Ensure your domain is allowlisted in the Firebase Console.');
      } else if (e.code === 'auth/popup-closed-by-user') {
        setError('Login cancelled: Please keep the popup window open until login completes.');
      } else if (e.code === 'auth/cancelled-popup-request') {
        setError('Existing login request cancelled.');
      } else {
        setError(e.message || 'An unknown error occurred during login.');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout Error:', e);
    }
  };

  useEffect(() => {
    localStorage.setItem('telegramEnabled', telegramEnabled.toString());
    localStorage.setItem('telegramToken', telegramToken);
    localStorage.setItem('telegramChatId', telegramChatId);
    localStorage.setItem('pushEnabled', pushEnabled.toString());
    localStorage.setItem('soundEnabled', soundEnabled.toString());
    localStorage.setItem('selectedTimeframe', timeframe);
  }, [telegramEnabled, telegramToken, telegramChatId, pushEnabled, soundEnabled, timeframe]);

  const sendTelegramMessage = async (message: string) => {
    if (!telegramEnabled || !telegramToken || !telegramChatId) return;
    try {
      const response = await fetchWithRetry('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: telegramToken,
          chatId: telegramChatId,
          text: message,
          parseMode: 'HTML'
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Connection failed' }));
        const errorMessage = errorData.error || errorData.description || 'Failed to send message';
        console.error('Telegram Proxy Error:', errorData);
        throw new Error(errorMessage);
      }
    } catch (e: any) {
      console.error('Telegram Error:', e);
      // Optional: set a UI error state if this was a manual test
      if (scanning) { // If called from testTelegram
        setError(`Telegram Error: ${e.message || 'Failed to connect to Bot API'}`);
      }
    }
  };

  const triggerManualTrade = async (symbol: string, side: 'BUY' | 'SELL', signalId?: string) => {
    if (!user || !binanceKey || !binanceSecret) {
      alert("Please ensure you are logged in and have Binance API keys configured.");
      return;
    }
    try {
      const response = await fetch('/api/manual-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          binanceKey,
          binanceSecret,
          userId: user.uid,
          tradeAmount: tradeAmount,
          leverage: leverage
        })
      });
      if (response.ok) {
        if (signalId) {
          setTradedIds(prev => new Set(prev).add(signalId));
        }
        setNotifications(prev => [{
          id: Date.now(),
          symbol,
          type: 'SUCCESS',
          message: `Market ${side} order executed successfully!`
        }, ...prev].slice(0, 5));
      } else {
        const errorData = await response.json();
        alert(`Manual trade failed: ${errorData.error}`);
      }
    } catch (e) {
      alert(`Manual trade error: ${e}`);
    }
  };

  const testTelegram = async () => {
    if (!telegramToken || !telegramChatId) {
      setError('Please enter both Token and Chat ID to test.');
      return;
    }
    setScanning(true);
    try {
      await sendTelegramMessage('🔔 <b>Connection Test</b>\n\nYour 24/7 Cloud Scanner is successfully connected to this Telegram chat.\n\n✅ <i>Ready for automated signals.</i>');
      // Show success notification instead of alert/toast for cleaner UI
      setNotifications(prev => [{
        id: Date.now(),
        symbol: 'SYS',
        type: 'INFO',
        message: 'Telegram test message sent!',
        time: Date.now()
      }, ...prev]);
    } catch (e) {
      setError('Failed to send test message. Check your token and chat ID.');
    } finally {
      setScanning(false);
    }
  };

  const testBinanceConnection = async () => {
    if (!binanceKey || !binanceSecret) {
      setError('Please enter both Binance API Key and Secret to test.');
      return;
    }
    setCheckingBinance(true);
    try {
      const res = await fetch('/api/binance/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: binanceKey, apiSecret: binanceSecret })
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => [{
          id: Date.now(),
          symbol: 'BINANCE',
          type: 'BUY',
          message: `Successfully connected! (Status: ${data.canTrade ? 'Trading Active' : 'Read Only'})`,
          time: Date.now()
        }, ...prev]);
      } else {
        setError(`Binance Connection Failed: ${data.error}`);
      }
    } catch (e) {
      setError('Failed to reach Binance API. Check your keys or network.');
    } finally {
      setCheckingBinance(false);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Browser notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setPushEnabled(true);
    } else {
      setPushEnabled(false);
    }
  };

  const showPushNotification = (title: string, body: string) => {
    if (!pushEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { 
        body, 
        icon: 'https://bin.bnbstatic.com/static/images/common/favicon.ico' 
      });
    } catch (e) {
      console.error('Push Notification Error:', e);
    }
  };

  const analyzeSignalWithAI = async (symbol: string, type: string, price: number) => {
    const id = `${symbol}-${type}`;
    setAnalyzingId(id);
    try {
      const prompt = `As a professional crypto trading analyst, provide a brief (2 sentences) technical rationale for a ${type} signal on ${symbol} at $${price}. Only provide technical analysis, no financial advice disclaimer. Focus on Entry only as exit targets are managed manually.`;
      const analysis = await generateText(prompt);
      setAiAnalysis(prev => ({ ...prev, [id]: analysis || 'Analysis unavailable.' }));
    } catch (e) {
      console.error("AI Analysis failed:", e);
      setAiAnalysis(prev => ({ ...prev, [id]: 'Analysis failed. Check your API key.' }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAiChat = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiInput('');
    setAiChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiChatLoading(true);
    try {
      const prompt = `You are a professional crypto trading assistant for the "24/7 Cloud Scanner". 
      Current Market Context: BTC is ${btcTrend?.trend || 'Syncing'}. 
      You help traders understand market dynamics, technical indicators, and how to use this bot.
      User Question: ${userMsg}
      Keep your answer concise and helpful.`;
      const response = await generateText(prompt);
      setAiChatHistory(prev => [...prev, { role: 'assistant', content: response || "I'm sorry, I couldn't process that." }]);
    } catch (e) {
      setAiChatHistory(prev => [...prev, { role: 'assistant', content: "Error: Failed to connect to Gemini AI. Ensure YOUR_GEMINI_API_KEY is correctly set in your secrets." }]);
    } finally {
      setAiChatLoading(false);
    }
  };

  // Check for alerts every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setAlerts(prev => {
        const updated = prev.map(alert => {
          if (!alert.triggered && now >= alert.alertTime) {
            // Trigger alert
            const newNotification = {
              id: alert.id, // Use alert ID for consistency and deduplication
              symbol: alert.symbol,
              type: alert.type,
              time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }),
              message: `30m Alert: ${alert.symbol} ${alert.type} signal reached!`,
              timestamp: Date.now()
            };
            
            /* 
            setNotifications(n => {
              if (n.find(item => item.id === alert.id)) return n;
              return [newNotification, ...n].slice(0, 5);
            });
            */

            // Send Phone Notifications
            const emoji = alert.type === "BUY" ? "🟢" : "🔴";
            const btcTrendText = btcTrend ? `${btcTrend.trend} ${btcTrend.trend === 'BULLISH' ? '🟢' : '🔴'}` : 'SYNCING...';
            
            const phoneMsg = `🚀 <b>Signal Alert: ${alert.symbol}</b>\n\n` +
                            `COPY COIN: <code>${alert.symbol}</code>\n\n` +
                            `Type: <code>${alert.type} ${emoji}</code>\n` +
                            `Timeframe: <code>${timeframe}</code>\n` +
                            `Symbol Trend: <code>${alert.trend || 'N/A'} ${alert.trend === 'BULLISH' ? '🟢' : '🔴'}</code>\n\n` +
                            `Recommended Leverage: <code>${alert.leverage || '9'}x</code>\n\n` +
                            `Time: <code>${newNotification.time}</code>\n` +
                            `Message: Artemis Signal Confirmed ✅`;

            sendTelegramMessage(phoneMsg);
            showPushNotification(`Signal Alert: ${alert.symbol}`, `${alert.type} signal reached!`);
            
            // Auto dismiss floating notification after 8 seconds
            setTimeout(() => {
              setNotifications(prev => prev.filter(n => n.id !== alert.id));
            }, 8000);
            
            if (soundEnabled) {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
              audio.play().catch(e => console.log('Sound play blocked:', e));
            }
            
            return { ...alert, triggered: true };
          }
          return alert;
        });
        return updated;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  // Consolidated Auto-scan logic
  useEffect(() => {
    if (!autoScan || !user) return;

    let timer: NodeJS.Timeout;
    
    const scheduleNextScan = () => {
      const now = new Date();
      const m = now.getMinutes();
      const rem = m % 5;
      
      // Calculate mins until next :02, :07, :12... (Offset by 2 mins to ensure Binance data is closed/ready)
      let delayMinutes = (rem < 2) ? (2 - rem) : (7 - rem);
      
      // If we are exactly on the mark (e.g. 05:02.000), wait another 5 mins
      if (delayMinutes === 0 && now.getSeconds() === 0 && now.getMilliseconds() === 0) {
        delayMinutes = 5;
      }
      
      const delay = (delayMinutes * 60 * 1000) - (now.getSeconds() * 1000) - now.getMilliseconds();

      timer = setTimeout(async () => {
        if (autoScan && !scanning) {
          console.log(`Scanner: Executing clock-aligned auto-scan at ${new Date().toLocaleTimeString()}`);
          // Always ensure BTC trend is the latest before coin scanning
          const freshTrend = await fetchBtcTrend('1h');
          startScan(freshTrend || undefined);
        }
        scheduleNextScan(); 
      }, delay);
    };

    // Run initial scan ONLY ONCE when user is ready AND if btcTrend is not null
    // If btcTrend is null, fetchBtcTrend will be called by startScan or the header sync
    if (!lastScanTime) {
      const runInitial = async () => {
        setScanning(true); // Pre-set scanning to block redundant triggers
        const freshTrend = await fetchBtcTrend('1h');
        startScan(freshTrend || undefined);
        setLastScanTime(Date.now());
      };
      runInitial();
    }

    scheduleNextScan();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [autoScan, user]); // No scanning/lastScanTime in deps to avoid infinite loops/resets

  const addAlert = (symbol: string, type: string, signalTime: number, tp?: number, sl?: number, trend?: string, leverage?: number) => {
    const alertTime = signalTime; // Trigger immediately when scanned
    const id = `${symbol}-${signalTime}`;
    
    setAlerts(prev => {
      if (prev.find(a => a.id === id)) return prev;
      return [...prev, {
        id,
        symbol,
        type,
        signalTime,
        alertTime,
        tp,
        sl,
        trend,
        leverage,
        triggered: false
      }];
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSymbol(text);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 3, backoff = 500, timeout = 30000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
        if (retries > 0) {
          console.warn(`Scanner: Rate limited (429) on ${url}. Retrying after ${wait}ms...`);
          await new Promise(resolve => setTimeout(resolve, wait));
          return fetchWithRetry(url, options, retries - 1, backoff * 2, timeout);
        }
      }
      
      // Safety check for non-JSON content from API routes
      if (url.startsWith('/api/') && response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          console.error(`Scanner: Non-JSON response from ${url}: ${contentType}`);
          throw new Error(`API returned ${contentType} instead of JSON.`);
        }
      }

      return response;
    } catch (error: any) {
      clearTimeout(id);
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      const errorMsg = isAbort ? 'Request timed out' : (error.message || 'Network error');
      
      if (retries > 0) {
        console.warn(`Scanner: Fetch failed for ${url} (${errorMsg}). Retrying in ${backoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2, timeout);
      }
      throw new Error(errorMsg);
    }
  };

  const startScan = async (trendOverride?: { trend: string, signalTime: number }) => {
    const activeTrend = trendOverride || btcTrend;
    setScanning(true);
    // Don't clear results immediately to avoid empty screen flash
    // setScanResults([]); 
    setScanProgress(0);
    
    if (!activeTrend) {
      setError("BTC Trend not yet loaded. Please wait for market status to sync (Check header).");
      setScanning(false);
      return;
    }

    try {
      // Fetch Binance Futures symbols
      const exchangeInfoRes = await fetchWithRetry('/api/exchangeInfo');
      if (!exchangeInfoRes.ok) {
        const errData = await exchangeInfoRes.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(`Exchange Info failed: ${errData.error || exchangeInfoRes.status}`);
      }
      
      let exchangeInfo;
      try {
        exchangeInfo = await exchangeInfoRes.json();
      } catch (e) {
        throw new Error("Failed to parse exchange info. Server might be blocked.");
      }

      if (!exchangeInfo.symbols) {
        throw new Error("Invalid exchange info received");
      }
      
      const usdtSymbols = exchangeInfo.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);

      if (usdtSymbols.length === 0) {
        throw new Error("No trading USDT symbols found");
      }

      const total = usdtSymbols.length;
      setTotalSymbols(total);
      const results: any[] = [];
      const batchSize = 12; // Batch size

      for (let i = 0; i < usdtSymbols.length; i += batchSize) {
        if (!autoScan && i > 0 && !scanning) break; // Allow stop

        const batch = usdtSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (s, index) => {
          const currentIndex = i + index;
          if (currentIndex >= usdtSymbols.length) return;
          
          try {
            // Use local proxy to avoid CORS/Rate limits for scanner
            const klinesRes = await fetchWithRetry(`/api/klines?symbol=${encodeURIComponent(s)}&interval=${timeframe}&limit=500`, {}, 3, 500, 30000);
            
            if (!klinesRes.ok) {
              if (klinesRes.status === 404 || klinesRes.status === 400 || klinesRes.status === 451) {
                // If it's region restricted (451), we still log it but don't stop the scan
                console.warn(`Scanner: [${s}] Skip due to status ${klinesRes.status}`);
                return;
              }
              const errData = await klinesRes.json().catch(() => ({ error: `Status ${klinesRes.status}` }));
              console.warn(`Scanner: [${s}] Error ${klinesRes.status}: ${errData.error}`);
              return;
            }
            
            let data;
            try {
              data = await klinesRes.json();
            } catch (e) {
              console.warn(`Scanner: [${s}] Failed to parse JSON response`);
              return;
            }

            if (!Array.isArray(data) || data.length === 0) return;

            const formatted: Candle[] = data.map((d: any) => ({
              time: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5]),
            }));
            
            const processed = processIndicators(formatted, { 
              bw,
              alpha,
              period,
              phase,
              filter,
              baseMult,
              spacingMode,
              sigmaWindow,
              useConfluence,
              warmupBars,
              cooldownGap,
              signalMode,
              slPnL,
              tpPnL,
              tradeAmount,
              leverage
            });

            const now = Date.now();
            const timeframeToMs: Record<string, number> = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 };
            const tfMs = timeframeToMs[timeframe] || 300000;
            const signalMaxAgeMs = tfMs * 30;
            const btcSignalTime = activeTrend.signalTime;
            const signalAgeLimit = now - signalMaxAgeMs;
            
            // Find a valid signal within the lookback window
            let foundSignal = null;
            for (let j = processed.length - 2; j >= 0; j--) {
              const candle = processed[j];
              
              const isBuy = candle.buySignal;
              const isSell = candle.sellSignal;
              
              if (isBuy || isSell) {
                const signalType = isBuy ? 'BUY' : 'SELL';
                
                // FILTER: Within last 30 candles
                const isRecent = candle.time >= signalAgeLimit;
                
                // FILTER: Match BTC Market Context if available
                const matchesBtc = !activeTrend || activeTrend.trend === signalType;
                // FILTER: Must be after/on the same candle as the market trend established
                const afterBtcFlip = activeTrend.signalTime === 0 || candle.time >= activeTrend.signalTime;

                if (isRecent && matchesBtc && afterBtcFlip) {
                  foundSignal = {
                    candle,
                    type: signalType as 'BUY' | 'SELL',
                    source: 'Artemis Strategy'
                  };
                  break; // Found the most recent valid signal
                }
              }
              
              // Only look back 40 candles for performance
              if (processed.length - j > 40) break;
            }

            if (foundSignal) {
              const { candle, type, source } = foundSignal;
              const signalData = {
                id: `${s}-${candle.time}-${source}`,
                symbol: s,
                type: type,
                source: source,
                price: candle.close,
                tpPrice: candle.tpPrice,
                slPrice: candle.slPrice,
                recommendedLeverage: candle.recommendedLeverage,
                time: candle.time,
                scanTime: Date.now()
              };
              
              // Ensure uniqueness in results array
              if (!results.find(r => r.id === signalData.id)) {
                results.push(signalData);
              }
              
              if (autoAlert) {
                addAlert(s, signalData.type, candle.time, signalData.tpPrice, signalData.slPrice, candle.trend, signalData.recommendedLeverage);
              }
            }
          } catch (e) {
            console.error(`Error scanning ${s}:`, e instanceof Error ? e.message : e);
          }
        }));

        // Smaller batch delay for performance
        await new Promise(resolve => setTimeout(resolve, 100));

        // Update progress and results after each batch
        const progress = total > 0 ? Math.min(100, Math.round(((i + batch.length) / total) * 100)) : 0;
        setScanProgress(progress);
        if (batch.length > 0) {
          setCurrentScanning(batch[batch.length - 1]);
        }
        
        const sortedResults = [...results].sort((a, b) => (b.time || 0) - (a.time || 0));
        setScanResults(sortedResults);
        
        // Minor pause to regulate API frequency and reduce CPU/Network load
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error('Scan failed:', err);
      setError(`Scanner Error: ${err.message || 'Check your internet connection or API status.'}`);
    } finally {
      setScanning(false);
      setScanProgress(0);
      setCurrentScanning(null);
    }
  };

  const fetchData = async (currentSymbol: string, currentTF: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry(`/api/klines?symbol=${currentSymbol}&interval=${currentTF}&limit=500`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }
      const data = await response.json();
      const formattedData: Candle[] = data.map((d: any) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
      setCandles(formattedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(symbol, timeframe);
    fetchBtcTrend('1h');
    const interval = setInterval(() => {
      fetchData(symbol, timeframe);
      fetchBtcTrend('1h');
    }, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  const fetchBtcTrend = async (forcedTF?: string): Promise<{ trend: string, signalTime: number } | null> => {
    setBtcTrendLoading(true);
    const contextTF = forcedTF || '1h';
    try {
      const response = await fetchWithRetry(`/api/klines?symbol=BTCUSDT&interval=${contextTF}&limit=100`);
      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch (e) {
          console.warn("BTC Trend: Failed to parse JSON response");
          return null;
        }
        
        const formatted: Candle[] = data.map((d: any) => ({
          time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
        }));
        const results = processIndicators(formatted, {
          bw, alpha, period, phase, filter, baseMult, spacingMode, sigmaWindow, useConfluence, warmupBars, cooldownGap, signalMode,
          slPnL, tpPnL, tradeAmount, leverage
        });
        const last = results[results.length - 1];
        if (last) {
          // Find the exact time the current trend started
          let btcSignalTime = last.time;
          for (let i = results.length - 1; i >= 1; i--) {
            if (results[i].trend !== results[i - 1].trend) {
              btcSignalTime = results[i].time;
              break;
            }
          }
          if (btcSignalTime === 0 && results.length > 0) btcSignalTime = results[0].time;

          const trendData = {
            trend: last.trend,
            signalTime: btcSignalTime
          };
          setBtcTrend(trendData);
          return trendData;
        }
      }
    } catch (e) {
      console.error("Failed to fetch BTC trend:", e);
    } finally {
      setBtcTrendLoading(false);
    }
    return null;
  };

  const processedData = useMemo(() => {
    if (candles.length === 0) return [];
    return processIndicators(candles, { 
      bw, alpha, period, phase, filter, baseMult, spacingMode, sigmaWindow, useConfluence, warmupBars, cooldownGap, signalMode,
      slPnL, tpPnL, tradeAmount, leverage
    });
  }, [candles, bw, alpha, period, phase, filter, baseMult, spacingMode, sigmaWindow, useConfluence, warmupBars, cooldownGap, signalMode, slPnL, tpPnL, tradeAmount, leverage]);

  const latest = processedData[processedData.length - 1];

  return (
    <div className="min-h-screen bg-[#0c0601] text-zinc-100 font-sans selection:bg-orange-500/30 relative overflow-hidden w-full">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:h-16 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-3 self-start sm:self-center">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-white to-orange-400 bg-clip-text text-transparent">
              CryptoPulse <span className="text-orange-500 font-mono text-sm ml-1">v1.0</span>
            </h1>
          </div>
          
          <div className="flex items-center justify-between w-full sm:w-auto gap-4">
            {authLoading ? (
              <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end hidden sm:flex">
                  <span className="text-xs font-medium text-white">{user.displayName}</span>
                  <button onClick={logout} className="text-[10px] text-orange-500 hover:text-orange-400 flex items-center gap-1">
                    <LogOut className="w-2 h-2" /> Logout
                  </button>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-orange-500/50" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/50">
                    <UserIcon className="w-4 h-4 text-orange-500" />
                  </div>
                )}
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={login}
                className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10 gap-2"
              >
                <LogIn className="w-4 h-4" /> Login
              </Button>
            )}
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => fetchData(symbol, timeframe)}
              className="border-orange-500/20 hover:bg-orange-500/10"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* BTC Trend Bar */}
      <div className="bg-orange-500/5 border-b border-orange-500/10 py-2">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full border border-orange-500/20 whitespace-nowrap">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">BTC Market Context</span>
              {btcTrendLoading ? (
                <div className="w-12 h-3 bg-zinc-800 animate-pulse rounded" />
              ) : btcTrend ? (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black italic uppercase ${btcTrend.trend === 'BULLISH' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    BTCUSDT.P: {btcTrend.trend} {btcTrend.trend === 'BULLISH' ? '🟢' : '🔴'}
                  </span>
                  {btcTrend.signal && (
                    <Badge className={`${btcTrend.signal === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'} text-black border-none text-[8px] h-4 font-black italic uppercase animate-pulse`}>
                      {btcTrend.signal} ACTIVE
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-zinc-600">Syncing Data...</span>
              )}
            </div>
            
            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
              <span className="text-[10px] text-zinc-500 uppercase font-medium">Session TF:</span>
              <Badge variant="outline" className="bg-orange-500/10 border-orange-500/20 text-orange-500 h-5 text-[10px] uppercase font-black italic">
                {timeframe}
              </Badge>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
             <div className="flex items-center gap-1.5 grayscale opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Binance Data Feed</span>
             </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-rose-900/10"
          >
            <div className="flex items-start gap-3 text-rose-400">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold whitespace-pre-line uppercase tracking-tight">{error}</p>
                <p className="text-[10px] text-rose-300/60 font-medium leading-relaxed">
                  {error.includes('451') || error.includes('blocked') 
                    ? "CRITICAL: Binance has restricted access from this server's region (likely USA). This prevents the scanner from reaching the exchange API."
                    : "NOTICE: Network instability or API rate limiting detected. If this persists, verify your connection or refresh the page."}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setError(null)}
              className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 h-8 self-end sm:self-center"
            >
              Dismiss
            </Button>
          </motion.div>
        )}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 tracking-tighter uppercase italic">
                 <LayoutDashboard className="w-6 h-6 text-orange-500" /> AI Dashboard <span className="text-orange-500">Live</span>
              </h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">V9 Sync Analysis Engine</p>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button 
                onClick={() => triggerManualTrade('UMAUSDT', 'BUY')}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-[0_0_15px_rgba(5,150,105,0.3)] h-11 px-4 font-black uppercase text-[10px] sm:text-xs transition-all active:scale-95"
              >
                <Zap className="w-4 h-4" /> TEST BUY UMA
              </Button>
              <Button 
                onClick={startScan} 
                disabled={scanning}
                className="flex-1 sm:flex-none bg-orange-600 hover:bg-orange-500 text-white gap-2 shadow-[0_0_15px_rgba(234,88,12,0.3)] h-11 px-6 font-black uppercase text-[10px] sm:text-xs transition-all active:scale-95"
              >
                {scanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span className="text-black">Scanning {scanProgress}%</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Market Scan
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <div id="scanner" className="space-y-6">
                  <Card className="bg-orange-950/20 border-orange-500/20 min-h-[600px] backdrop-blur-sm shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-orange-500/10 flex flex-row items-center justify-between bg-orange-500/[0.02]">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  <ListFilter className="w-5 h-5 text-orange-500" /> Filtered Signals
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Rules: Artemis Regression Bands + Multi-Sigma Confidence Interval
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-black/40 border-white/10 text-white">
                {scanResults.length} Signals / {totalSymbols || '---'} Coins
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
                  <div className="overflow-x-auto w-full">
                    <div className="min-w-[800px]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-black/20">
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Symbol</th>
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Signal</th>
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Market Price</th>
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">TradingView</th>
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Time</th>
                            <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {scanResults.length === 0 && !scanning && (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-zinc-500">
                                No signals found. Click "Start Full Scan" to analyze the market.
                              </td>
                            </tr>
                          )}
                          {scanning && scanResults.length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-12 text-center">
                                <div className="flex flex-col items-center gap-4">
                                  <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                                  <div className="space-y-1">
                                    <p className="text-zinc-100 font-medium">Scanning {totalSymbols} Binance Futures... {scanProgress}%</p>
                                    <p className="text-zinc-500 text-xs font-mono">Analyzing {currentScanning}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          <AnimatePresence mode="popLayout">
                            {scanResults.map((res) => (
                              <motion.tr 
                                key={res.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="hover:bg-orange-500/5 transition-colors group"
                              >
                                <td className="p-4">
                                  <div 
                                    className="flex items-center gap-2 cursor-pointer group/copy hover:bg-orange-500/10 p-1 -ml-1 rounded transition-colors w-fit"
                                    onClick={() => copyToClipboard(res.symbol)}
                                    title="Click to copy symbol"
                                  >
                                    <span className="font-bold text-zinc-100">{res.symbol}</span>
                                    <div className="opacity-40 group-hover/copy:opacity-100 transition-opacity">
                                      {copiedSymbol === res.symbol ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-zinc-400 group-hover/copy:text-orange-500" />
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <Badge className={cn(
                                    "border-none",
                                    res.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                  )}>
                                    {res.type}
                                  </Badge>
                                </td>
                                <td className="p-4 font-mono text-zinc-300">${res.price.toFixed(4)}</td>
                                <td className="p-4">
                                  <a 
                                    href={`https://www.tradingview.com/chart/?symbol=BINANCE:${res.symbol}.P`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800/80 hover:bg-orange-500/20 text-zinc-100 hover:text-orange-400 rounded-md text-[10px] font-bold transition-all border border-zinc-700 hover:border-orange-500/30 uppercase tracking-widest w-fit"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Chart
                                  </a>
                                </td>
                                <td className="p-4 text-xs text-zinc-500 font-mono">
                                  {new Date(res.time).toLocaleTimeString('en-US', {
                                    timeZone: 'Asia/Colombo',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  })} <span className="text-[10px] opacity-70">IST</span>
                                </td>
                                <td className="p-4 text-right">
                                  {tradedIds.has(res.id) ? (
                                    <div className="flex justify-end pr-4">
                                      <div className="w-7 h-7 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
                                        <Check className="w-4 h-4 text-emerald-500" />
                                      </div>
                                    </div>
                                  ) : (
                                    <Button 
                                      size="sm"
                                      onClick={() => triggerManualTrade(res.symbol, res.type, res.id)}
                                      className={cn(
                                        "h-7 px-3 text-[10px] font-black uppercase transition-all shadow-lg active:scale-95",
                                        res.type === 'BUY' 
                                          ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20" 
                                          : "bg-rose-600 hover:bg-rose-500 shadow-rose-900/20"
                                      )}
                                    >
                                      Run {res.type}
                                    </Button>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

            {/* Sidebar Section */}
            <div className="space-y-6">
                <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
                  <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                      <Settings className="w-4 h-4 text-orange-500" /> Indicator Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-zinc-300">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Timeframe</label>
                      <select 
                        value={timeframe} 
                        onChange={(e) => setTimeframe(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 h-8 text-xs font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="1m">1m</option>
                        <option value="5m">5m</option>
                        <option value="15m">15m</option>
                        <option value="1h">1h</option>
                        <option value="4h">4h</option>
                        <option value="1d">1d</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Bandwidth</label>
                      <Input 
                        type="number" 
                        value={isNaN(bw) ? '' : bw} 
                        onChange={(e) => setBw(parseInt(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Kernel Alpha</label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={isNaN(alpha) ? '' : alpha} 
                        onChange={(e) => setAlpha(parseFloat(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Base Multiplier</label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={isNaN(baseMult) ? '' : baseMult} 
                        onChange={(e) => setBaseMult(parseFloat(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Spacing Mode</label>
                      <select 
                        value={spacingMode} 
                        onChange={(e) => setSpacingMode(e.target.value as any)}
                        className="w-full bg-black/40 border border-white/10 h-8 text-xs font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="Linear">Linear</option>
                        <option value="Exponential">Exponential</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-black/20 rounded-md border border-white/5">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Trend Conf.</label>
                      <button 
                        onClick={() => setUseConfluence(!useConfluence)}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          useConfluence ? "bg-orange-500" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                          useConfluence ? "translate-x-4.5" : "translate-x-0.5"
                        )} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Default Leverage</label>
                      <Input 
                        type="number" 
                        value={isNaN(leverage) ? '' : leverage} 
                        onChange={(e) => setLeverage(parseInt(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-orange-950/20 border-orange-500/20">
                  <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02] py-3">
                    <CardTitle className="text-[11px] font-bold text-white uppercase flex items-center gap-2">
                       <Bell className="w-3 h-3 text-orange-500" /> Scans & Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">Auto-Scan (5m)</span>
                      <button 
                        onClick={() => setAutoScan(!autoScan)}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          autoScan ? "bg-orange-500" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                          autoScan ? "translate-x-4.5" : "translate-x-0.5"
                        )} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Lookback (Mins)</label>
                      <Input 
                        type="number" 
                        value={isNaN(scanLookbackMinutes) ? '' : scanLookbackMinutes} 
                        onChange={(e) => setScanLookbackMinutes(parseInt(e.target.value))}
                        className="bg-black/40 border-white/10 h-7 text-[10px] font-mono"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
                  <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02] py-3">
                    <CardTitle className="text-[11px] font-bold uppercase flex items-center gap-2 text-white">
                      <Info className="w-3 h-3 text-orange-500" /> Legend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[10px] py-0 h-5">BUY</Badge>
                      <span className="text-[10px] text-zinc-400">Artemis Reversion Long</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-rose-500/20 text-rose-400 border-none text-[10px] py-0 h-5">SELL</Badge>
                      <span className="text-[10px] text-zinc-400">Artemis Reversion Short</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
                <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                    <Send className="w-5 h-5 text-orange-500" /> Telegram & Bot Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-orange-500/5 rounded-xl border border-orange-500/10">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-sky-400" />
                          <span className="text-sm border-zinc-100 font-bold">Telegram Alerts</span>
                        </div>
                        <button 
                          onClick={() => setTelegramEnabled(!telegramEnabled)}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative",
                            telegramEnabled ? "bg-orange-500" : "bg-zinc-800"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-transform",
                            telegramEnabled ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase">Bot Token</label>
                        <div className="relative">
                          <Input 
                            type={showTelegramToken ? "text" : "password"} 
                            placeholder="123456789:ABC..." 
                            value={telegramToken}
                            onChange={(e) => setTelegramToken(e.target.value)}
                            className="bg-black/40 border-orange-500/20 h-10 text-white placeholder:text-zinc-600 focus:border-orange-500/50 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTelegramToken(!showTelegramToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-orange-500 transition-colors"
                          >
                            {showTelegramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase">Chat ID</label>
                        <Input 
                          placeholder="-100123456789" 
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          className="bg-black/40 border-orange-500/20 h-10 text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-orange-500/5 rounded-xl border border-orange-500/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-zinc-100 font-bold">
                            <Volume2 className={cn("w-4 h-4", soundEnabled ? "text-orange-500" : "text-zinc-500")} /> Sound Alerts
                          </div>
                          <button 
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative",
                              soundEnabled ? "bg-orange-500" : "bg-zinc-800"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-3 h-3 bg-white rounded-full transition-transform",
                              soundEnabled ? "translate-x-6" : "translate-x-1"
                            )} />
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-zinc-100 font-bold">
                            <Globe className="w-4 h-4 text-orange-500" /> Cloud Scanner
                          </div>
                          <button 
                            onClick={() => setAutoScan(!autoScan)}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative",
                              autoScan ? "bg-orange-500" : "bg-zinc-800"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-3 h-3 bg-white rounded-full transition-transform",
                              autoScan ? "translate-x-6" : "translate-x-1"
                            )} />
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          When enabled, our cloud server analyzes all symbols 24/7 every 1 minute and sends notifications directly to your Telegram.
                        </p>
                      </div>

                      <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                        <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                          <Info className="w-3 h-3 text-orange-500" /> Setup
                        </h4>
                        <ul className="text-[10px] text-zinc-500 space-y-1 list-disc pl-4">
                          <li>Contact @BotFather for Token</li>
                          <li>Contact @userinfobot for Chat ID</li>
                          <li>Save settings and toggle enabled</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <Button 
                      variant="outline"
                      className="border-zinc-800 hover:bg-zinc-800 text-zinc-400 h-10 rounded-xl"
                      onClick={testTelegram}
                      disabled={scanning}
                    >
                      {scanning ? 'Testing...' : 'Test Telegram'}
                    </Button>
                    <Button 
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 rounded-xl px-8"
                      onClick={saveSettingsToFirebase}
                    >
                      Save Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl mt-6">
                <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                    <Zap className="w-5 h-5 text-orange-500" /> Binance Futures Auto-Trading
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-orange-500/5 rounded-xl border border-orange-500/10 gap-4 sm:gap-0">
                    <div className="flex items-center gap-2">
                      <Zap className={cn("w-4 h-4", autoTradeEnabled ? "text-orange-500" : "text-zinc-500")} />
                      <div className="flex flex-col">
                        <span className="text-sm border-zinc-100 font-bold">Auto Trade Mode</span>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Execute signals automatically</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative self-end sm:self-center",
                        autoTradeEnabled ? "bg-orange-500" : "bg-zinc-800"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-3 h-3 bg-white rounded-full transition-transform",
                        autoTradeEnabled ? "translate-x-6" : "translate-x-1"
                      )} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400 uppercase">Binance API Key (Futures)</label>
                      <div className="relative">
                        <Input 
                          type={showBinanceKey ? "text" : "password"} 
                          value={binanceKey}
                          onChange={(e) => setBinanceKey(e.target.value)}
                          className="bg-black/40 border-orange-500/20 h-10 text-white placeholder:text-zinc-600 focus:border-orange-500/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBinanceKey(!showBinanceKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-orange-500 transition-colors"
                        >
                          {showBinanceKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400 uppercase">Binance Secret Key</label>
                      <div className="relative">
                        <Input 
                          type={showBinanceSecret ? "text" : "password"} 
                          value={binanceSecret}
                          onChange={(e) => setBinanceSecret(e.target.value)}
                          className="bg-black/40 border-orange-500/20 h-10 text-white placeholder:text-zinc-600 focus:border-orange-500/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBinanceSecret(!showBinanceSecret)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-orange-500 transition-colors"
                        >
                          {showBinanceSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400 uppercase">Amount per Trade (USDT)</label>
                      <Input 
                        type="number" 
                        value={isNaN(tradeAmount) ? '' : tradeAmount}
                        onChange={(e) => setTradeAmount(parseFloat(e.target.value))}
                        className="bg-black/40 border-orange-500/20 h-10 text-white focus:border-orange-500/50 font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400 uppercase">Max Open Trades</label>
                      <Input 
                        type="number" 
                        value={isNaN(maxOpenTrades) ? '' : maxOpenTrades}
                        onChange={(e) => setMaxOpenTrades(parseInt(e.target.value))}
                        className="bg-black/40 border-orange-500/20 h-10 text-white focus:border-orange-500/50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-2 border-b border-orange-500/10 gap-2 sm:gap-0">
                       <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3" /> Mandatory Setup
                      </h4>
                      <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded text-[10px] font-mono border border-white/5 group relative w-full sm:w-auto">
                        <span className="text-zinc-500">TRUSTED IP:</span>
                        <span className="text-orange-400 font-bold flex-1 sm:flex-none">{serverIp}</span>
                        <button
                          onClick={async () => {
                            setServerIp('Loading...');
                            try {
                              const r = await fetch('/api/server-ip');
                              const d = await r.json();
                              setServerIp(d.ip || 'Unknown');
                            } catch (e) {
                              setServerIp('Failed');
                            }
                          }}
                          className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
                          title="Refresh IP"
                        >
                          <RefreshCw className="w-3 h-3 text-zinc-400" />
                        </button>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(serverIp);
                            alert("IP Copied to clipboard!");
                          }}
                          className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
                          title="Copy IP"
                        >
                          <Copy className="w-3 h-3 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-orange-500">1</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-zinc-100">Whitelist Server IP</p>
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            Log in to Binance API Management. Select "Restrict access to trusted IPs only" and paste <code className="bg-black/40 px-1 rounded text-orange-400">{serverIp}</code>.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-orange-500">2</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-zinc-100">Enable Futures Trading</p>
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            Check the <span className="text-orange-400 font-bold underline">"Enable Futures"</span> permission checkbox in your Binance API settings.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-orange-500">3</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-zinc-100">Futures Hedge Mode</p>
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            Open Binance Futures terminal, go to <span className="text-orange-400 font-bold italic">Preferences → Position Mode</span> and select <span className="text-white font-bold">"Hedge Mode"</span>.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-orange-500/10">
                      <p className="text-[9px] text-zinc-500 italic">
                        * Binance US accounts are not supported. Only Binance Global (dot com) keys work.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <Button 
                      variant="outline"
                      className="border-zinc-800 hover:bg-zinc-800 text-zinc-400 h-10 rounded-xl"
                      onClick={testBinanceConnection}
                      disabled={checkingBinance}
                    >
                      {checkingBinance ? 'Verifying...' : 'Verify Binance Connection'}
                    </Button>
                    <Button 
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 rounded-xl px-8"
                      onClick={saveSettingsToFirebase}
                    >
                      Save API Keys
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="col-span-1 space-y-6">
              <Card className="bg-black/40 border border-white/5 backdrop-blur-sm overflow-hidden flex flex-col h-[500px]">
                <CardHeader className="py-3 px-4 bg-orange-500/[0.02] border-b border-orange-500/10 flex flex-row items-center justify-between shrink-0">
                  <CardTitle className="text-xs font-bold text-orange-500 uppercase flex items-center gap-2">
                     <Activity className="w-3 h-3" /> Latest Activity
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px] h-5">Live</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-orange-500/20">
                   <div className="divide-y divide-white/5">
                      {activityLogs.length === 0 ? (
                        <div className="p-8 text-center">
                          <History className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                          <p className="text-xs text-zinc-600">No activity recorded yet.<br/>Waiting for next scan...</p>
                        </div>
                      ) : (
                        activityLogs.map((log) => (
                          <div key={log.id} className="p-3 hover:bg-white/[0.02] transition-colors">
                            <div className="flex justify-between items-start mb-1">
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                log.type === 'SUCCESS' ? "bg-emerald-500/10 text-emerald-500" :
                                log.type === 'ERROR' ? "bg-red-500/10 text-red-500" :
                                log.type === 'WARNING' ? "bg-amber-500/10 text-amber-500" :
                                "bg-blue-500/10 text-blue-400"
                              )}>
                                {log.symbol || 'SYSTEM'}
                              </span>
                              <span className="text-[10px] text-zinc-600 font-mono">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-tight">{log.message}</p>
                          </div>
                        ))
                      )}
                   </div>
                </CardContent>
                <div className="p-3 bg-zinc-900/50 border-t border-white/5 shrink-0">
                   <div className="flex items-center justify-between opacity-60">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-zinc-400">Scanner Online</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">Auto-Trade: {autoTradeEnabled ? 'ON' : 'OFF'}</span>
                   </div>
                </div>
              </Card>

              <Card className="bg-black/40 border border-white/5 backdrop-blur-sm overflow-hidden">
                <CardHeader className="py-2 px-4 bg-zinc-900/50 border-b border-white/5">
                   <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase">Bot Status</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                   <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Telegram Status</span>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px]">Active</Badge>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Binance API</span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px]",
                          binanceKey && binanceSecret ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" : "border-zinc-500/30 text-zinc-500 bg-zinc-500/5"
                        )}
                      >
                        {binanceKey && binanceSecret ? "Connected" : "Not Linked"}
                      </Badge>
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Floating AI Assistant */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {showAiAssistant && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-80 sm:w-96 bg-zinc-950 border border-orange-500/30 rounded-2xl shadow-[0_0_50px_-12px_rgba(249,115,22,0.3)] overflow-hidden flex flex-col h-[500px]"
            >
              <div className="p-4 bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-500 rounded-lg">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">AI Trading Assistant</h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-zinc-400 uppercase font-black">Connected</span>
                    </div>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowAiAssistant(false)}
                  className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-800">
                {aiChatHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-40">
                    <MessageSquare className="w-8 h-8 text-zinc-500" />
                    <p className="text-xs text-zinc-400 px-8">Ask me about current market trends, signals, or trading strategy.</p>
                  </div>
                )}
                {aiChatHistory.map((chat, i) => (
                  <div key={i} className={cn(
                    "flex flex-col max-w-[85%]",
                    chat.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}>
                    <div className={cn(
                      "p-3 rounded-2xl text-[12px] leading-relaxed",
                      chat.role === 'user' 
                        ? "bg-orange-500 text-white rounded-tr-none" 
                        : "bg-zinc-900 border border-white/5 text-zinc-300 rounded-tl-none"
                    )}>
                      {chat.content}
                    </div>
                  </div>
                ))}
                {aiChatLoading && (
                  <div className="flex items-center gap-2 text-zinc-500">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Bot is thinking</span>
                  </div>
                )}
              </div>

              <div className="p-4 bg-zinc-900/50 border-t border-white/5">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleAiChat(); }}
                  className="relative"
                >
                  <Input 
                    placeholder="Ask about the market..."
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    className="bg-black/60 border-orange-500/20 pr-10 text-xs h-10 placeholder:text-zinc-600 focus:border-orange-500/50"
                  />
                  <button 
                    type="submit"
                    disabled={aiChatLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-orange-500 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAiAssistant(!showAiAssistant)}
          className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center shadow-[0_0_30px_-5px_rgba(249,115,22,0.5)] cursor-pointer group relative"
        >
          {showAiAssistant ? <X className="text-white w-6 h-6" /> : <Bot className="text-white w-6 h-6" />}
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-950" />
        </motion.button>
      </div>
    </div>
  );
}
