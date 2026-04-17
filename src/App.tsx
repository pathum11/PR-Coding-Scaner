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
  Check,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  History,
  Send,
  Globe,
  Activity
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

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Indicator Settings
  const [sensitivity, setSensitivity] = useState(20); // ATR Period
  const [multiplier, setMultiplier] = useState(3.0); // ATR Multiplier
  const [useFilter, setUseFilter] = useState(false);
  const [confirmationSignals, setConfirmationSignals] = useState(true);
  const [contrarianSignals, setContrarianSignals] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  // RSI Histogram Settings
  const [rsiHistLength, setRsiHistLength] = useState(14);
  const [rsiHistMALength, setRsiHistMALength] = useState(14);
  const [rsiHistMAType, setRsiHistMAType] = useState('JMA');
  const [rsiSource, setRsiSource] = useState<'CLOSE' | 'HL2'>('CLOSE');
  const [kamaAlpha, setKamaAlpha] = useState(3);

  // ZigZag Settings
  const [zigzagLength, setZigzagLength] = useState(14);
  const [zigzagPhase, setZigzagPhase] = useState(50);
  const [zigzagPower, setZigzagPower] = useState(2);
  const [tpRatio, setTpRatio] = useState(2.0);
  const [slLookback, setSlLookback] = useState(3);

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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [scanLookbackMinutes, setScanLookbackMinutes] = useState(30);
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [signalHistory, setSignalHistory] = useState<any[]>([]);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Telegram & Push Settings
  const [telegramEnabled, setTelegramEnabled] = useState(() => localStorage.getItem('telegramEnabled') === 'true');
  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('telegramToken') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('telegramChatId') || '');
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem('pushEnabled') === 'true');

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
            if (data.sensitivity !== undefined) setSensitivity(data.sensitivity);
            if (data.multiplier !== undefined) setMultiplier(data.multiplier);
            if (data.useFilter !== undefined) setUseFilter(data.useFilter);
            if (data.rsiHistLength !== undefined) setRsiHistLength(data.rsiHistLength);
            if (data.rsiHistMALength !== undefined) setRsiHistMALength(data.rsiHistMALength);
            if (data.rsiHistMAType !== undefined) setRsiHistMAType(data.rsiHistMAType);
            if (data.rsiSource !== undefined) setRsiSource(data.rsiSource);
            if (data.zigzagLength !== undefined) setZigzagLength(data.zigzagLength);
            if (data.tpRatio !== undefined) setTpRatio(data.tpRatio);
            if (data.slLookback !== undefined) setSlLookback(data.slLookback);
            if (data.scanLookbackMinutes !== undefined) setScanLookbackMinutes(data.scanLookbackMinutes);
            else if (data.scanLookbackHours !== undefined) setScanLookbackMinutes(data.scanLookbackHours * 60);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const saveSettingsToFirebase = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        uid: user.uid,
        telegramEnabled,
        telegramToken,
        telegramChatId,
        autoScan,
        sensitivity,
        multiplier,
        useFilter,
        rsiHistLength,
        rsiHistMALength,
        rsiHistMAType,
        rsiSource,
        zigzagLength,
        tpRatio,
        slLookback,
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
    telegramEnabled, telegramToken, telegramChatId, autoScan, 
    sensitivity, multiplier, useFilter, rsiHistLength, 
    rsiHistMALength, rsiHistMAType, rsiSource, zigzagLength, 
    tpRatio, slLookback, scanLookbackMinutes, user
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
  }, [telegramEnabled, telegramToken, telegramChatId, pushEnabled]);

  const sendTelegramMessage = async (message: string) => {
    if (!telegramEnabled || !telegramToken || !telegramChatId) return;
    try {
      const response = await fetch('/api/telegram', {
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
        const errorData = await response.json();
        console.error('Telegram Proxy Error:', errorData);
      }
    } catch (e) {
      console.error('Telegram Error:', e);
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
              message: `30m Alert: ${alert.symbol}.P ${alert.type} signal reached!`,
              timestamp: Date.now()
            };
            
            setNotifications(n => {
              if (n.find(item => item.id === alert.id)) return n;
              return [newNotification, ...n].slice(0, 5);
            });

            setNotificationHistory(n => {
              if (n.find(item => item.id === alert.id)) return n;
              return [newNotification, ...n].slice(0, 100);
            });

            // Send Phone Notifications
            const phoneMsg = `🚀 <b>Signal Alert: ${alert.symbol}.P</b>\nType: ${alert.type}\nTime: ${newNotification.time}\nMessage: ${newNotification.message}`;
            sendTelegramMessage(phoneMsg);
            showPushNotification(`Signal Alert: ${alert.symbol}.P`, `${alert.type} signal reached!`);
            
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

  // Auto-scan logic
  useEffect(() => {
    if (!autoScan) return;

    const interval = setInterval(() => {
      if (!scanning) {
        startScan();
        setLastScanTime(Date.now());
      }
    }, 300000); // Every 5 minutes

    // Initial scan if enabled
    if (!scanning && (!lastScanTime || Date.now() - lastScanTime > 300000)) {
      startScan();
      setLastScanTime(Date.now());
    }

    return () => clearInterval(interval);
  }, [autoScan, scanning, lastScanTime]);

  const addAlert = (symbol: string, type: string, signalTime: number) => {
    const alertTime = signalTime + (30 * 60 * 1000); // 30 minutes later
    const id = `${symbol}-${signalTime}`;
    
    setAlerts(prev => {
      if (prev.find(a => a.id === id)) return prev;
      return [...prev, {
        id,
        symbol,
        type,
        signalTime,
        alertTime,
        triggered: false
      }];
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSymbol(text);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  const fetchWithRetry = async (url: string, retries = 3, backoff = 500): Promise<Response> => {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, wait));
          return fetchWithRetry(url, retries - 1, backoff * 2);
        }
      }
      return response;
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, retries - 1, backoff * 2);
      }
      throw error;
    }
  };

  const startScan = async () => {
    setScanning(true);
    setScanResults([]);
    setScanProgress(0);
    
    try {
      // Fetch Binance Futures symbols
      const exchangeInfoRes = await fetchWithRetry('/api/exchangeInfo');
      const exchangeInfo = await exchangeInfoRes.json();
      const usdtSymbols = exchangeInfo.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);

      const total = usdtSymbols.length;
      setTotalSymbols(total);
      const results: any[] = [];
      const batchSize = 25; // Optimized batch size for faster scanning

      for (let i = 0; i < usdtSymbols.length; i += batchSize) {
        const batch = usdtSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (s, index) => {
          const currentIndex = i + index;
          if (currentIndex >= usdtSymbols.length) return;
          
          try {
            // Use local proxy to avoid CORS/Rate limits for scanner
            const klinesRes = await fetchWithRetry(`/api/klines?symbol=${encodeURIComponent(s)}&interval=${timeframe}&limit=500`);
            if (!klinesRes.ok) {
              const errText = await klinesRes.text().catch(() => "Unknown error");
              if (klinesRes.status === 404) {
                console.warn(`Symbol ${s} not found on Futures, skipping.`);
                return;
              }
              throw new Error(`Klines failed with status ${klinesRes.status}: ${errText}`);
            }
            
            const data = await klinesRes.json();
            if (!Array.isArray(data)) return;

            const formatted: Candle[] = data.map((d: any) => ({
              time: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5]),
            }));
            
            const processed = processIndicators(formatted, { 
              sensitivity, 
              multiplier, 
              useFilter,
              rsiHistLength,
              rsiHistMALength,
              rsiHistMAType,
              kamaAlpha,
              rsiSource,
              zigzagLength,
              zigzagPhase,
              zigzagPower,
              tpRatio,
              slLookback
            });

            const now = Date.now();
            const lookbackMs = scanLookbackMinutes * 60 * 1000;
            const lookbackLimit = now - lookbackMs;
            
            // Find the most recent signal within the lookback window
            let foundSignal = null;
            for (let j = processed.length - 1; j >= 0; j--) {
              const candle = processed[j];
              if (candle.time < lookbackLimit) break;
              
              const isBuy = candle.buySignal;
              const isSell = candle.sellSignal;
              
              if (isBuy || isSell) {
                foundSignal = {
                  candle,
                  type: isBuy ? 'BUY' : 'SELL' as 'BUY' | 'SELL',
                  source: 'Triple Confirmation'
                };
                break;
              }
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
                time: candle.time,
                isStrong: candle.isStrong,
                scanTime: Date.now()
              };
              
              // Ensure uniqueness in results array
              if (!results.find(r => r.id === signalData.id)) {
                results.push(signalData);
              }
              
              // Add to history
              setSignalHistory(prev => {
                if (prev.find(h => h.id === signalData.id)) return prev;
                return [signalData, ...prev].slice(0, 100);
              });

              if (autoAlert) {
                addAlert(s, signalData.type, candle.time);
              }
            }
          } catch (e) {
            console.error(`Error scanning ${s}:`, e instanceof Error ? e.message : e);
          }
        }));

        // Smaller batch delay for performance
        await new Promise(resolve => setTimeout(resolve, 100));

        // Update progress and results after each batch
        const progress = Math.min(100, Math.round(((i + batch.length) / total) * 100));
        setScanProgress(progress);
        if (batch.length > 0) {
          setCurrentScanning(batch[batch.length - 1]);
        }
        
        const sortedResults = [...results].sort((a, b) => (b.time || 0) - (a.time || 0));
        setScanResults(sortedResults);
        
        // Minor pause to regulate API frequency
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
      setCurrentScanning(null);
    }
  };

  const fetchData = async (currentSymbol: string, currentTF: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/klines?symbol=${currentSymbol}&interval=${currentTF}&limit=500`);
      if (!response.ok) throw new Error('Failed to fetch data');
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
    const interval = setInterval(() => fetchData(symbol, timeframe), 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  const processedData = useMemo(() => {
    if (candles.length === 0) return [];
    return processIndicators(candles, { 
      sensitivity, 
      multiplier, 
      useFilter,
      rsiHistLength,
      rsiHistMALength,
      rsiHistMAType,
      kamaAlpha,
      rsiSource,
      zigzagLength,
      zigzagPhase,
      zigzagPower,
      tpRatio,
      slLookback
    });
  }, [candles, sensitivity, multiplier, useFilter, rsiHistLength, rsiHistMALength, rsiHistMAType, kamaAlpha, rsiSource, zigzagLength, zigzagPhase, zigzagPower, tpRatio, slLookback]);

  const latest = processedData[processedData.length - 1];

  return (
    <div className="min-h-screen bg-[#0c0601] text-zinc-100 font-sans selection:bg-orange-500/30 relative overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-orange-400 bg-clip-text text-transparent">
              CryptoPulse <span className="text-orange-500 font-mono text-sm ml-1">v1.0</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
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

      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2 tracking-tighter uppercase italic">
                 <LayoutDashboard className="w-6 h-6 text-orange-500" /> AI Dashboard <span className="text-orange-500">Live</span>
              </h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Unified Triple Confirmation Analysis Engine</p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                onClick={startScan} 
                disabled={scanning}
                className="bg-orange-600 hover:bg-orange-500 text-white gap-2 shadow-[0_0_15px_rgba(234,88,12,0.3)] h-11 px-6 font-black uppercase text-xs transition-all active:scale-95"
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
            {/* AI Dashboard Summary Section */}
            {processedData.length > 0 && (
              <div className="space-y-4">
                {/* 1. Main Signal Box */}
                {(() => {
                  const last = processedData[processedData.length - 1];
                  const hasTrend = last.trend === 'BULLISH';
                  const hasMomentum = (last.rsiHist || 0) > 0;
                  const hasTrigger = last.zigzagSignal === 'BUY';
                  
                  const isShortTrend = last.trend === 'BEARISH';
                  const isShortMomentum = (last.rsiHist || 0) < 0;
                  const isShortTrigger = last.zigzagSignal === 'SELL';

                  if (hasTrend && hasMomentum && hasTrigger) {
                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 rounded-2xl bg-emerald-500 text-black text-center shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                      >
                        <h2 className="text-2xl font-black flex items-center justify-center gap-3">
                          <TrendingUp className="w-8 h-8" /> 🚀 STRONG BUY SIGNAL
                        </h2>
                        <p className="text-xs font-bold opacity-70 mt-1 uppercase tracking-widest">Triple Confirmation Confirmed</p>
                      </motion.div>
                    );
                  } else if (isShortTrend && isShortMomentum && isShortTrigger) {
                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 rounded-2xl bg-rose-500 text-white text-center shadow-[0_0_30px_rgba(244,63,94,0.3)]"
                      >
                        <h2 className="text-2xl font-black flex items-center justify-center gap-3">
                          <TrendingDown className="w-8 h-8" /> 📉 STRONG SELL SIGNAL
                        </h2>
                        <p className="text-xs font-bold opacity-70 mt-1 uppercase tracking-widest">Triple Confirmation Confirmed</p>
                      </motion.div>
                    );
                  } else {
                    return (
                      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-center">
                        <h2 className="text-2xl font-black flex items-center justify-center gap-3">
                          <RefreshCw className="w-6 h-6 animate-spin-slow" /> ⏳ WAITING FOR CONFIRMATION
                        </h2>
                        <p className="text-xs font-medium opacity-50 mt-1 uppercase tracking-widest">Searching for High Probability Setup</p>
                      </div>
                    );
                  }
                })()}

                {/* 2. Indicators Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const last = processedData[processedData.length - 1];
                    return (
                      <>
                        <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Supertrend</span>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-lg font-black", last.trend === 'BULLISH' ? "text-emerald-400" : "text-rose-400")}>
                              {last.trend || 'NEUTRAL'}
                            </span>
                            <Badge variant="outline" className={last.trend === 'BULLISH' ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500"}>
                              Trend
                            </Badge>
                          </div>
                        </div>
                        <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">RSI Histogram</span>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-lg font-black", (last.rsiHist || 0) > 0 ? "text-emerald-400" : "text-rose-400")}>
                              {(last.rsiHist || 0) > 0 ? 'POSITIVE' : 'NEGATIVE'}
                            </span>
                            <span className="text-xs font-mono text-zinc-400">{(last.rsiHist || 0).toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-xl flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">ZigZag Trigger</span>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-lg font-black", last.zigzagSignal ? (last.zigzagSignal === 'BUY' ? "text-emerald-400" : "text-rose-400") : "text-zinc-600")}>
                              {last.zigzagSignal ? (last.zigzagSignal === 'BUY' ? 'UP' : 'DOWN') : 'NONE'}
                            </span>
                            <Badge variant="outline" className="border-white/10 text-white">Trigger</Badge>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* 3. Trading Levels */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const last = processedData[processedData.length - 1];
                    return (
                      <>
                        <div className="bg-sky-500/5 border border-sky-500/20 p-4 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                             <Target className="w-4 h-4 text-sky-400" />
                             <span className="text-xs font-bold text-sky-400 uppercase">Entry Price</span>
                          </div>
                          <span className="text-xl font-black text-white">${last.close.toLocaleString()}</span>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                             <TrendingUp className="w-4 h-4 text-emerald-400" />
                             <span className="text-xs font-bold text-emerald-400 uppercase">Take Profit (1:2)</span>
                          </div>
                          <span className="text-xl font-black text-emerald-400">${(last.tpPrice || (last.close * 1.02)).toLocaleString()}</span>
                        </div>
                        <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                             <TrendingDown className="w-4 h-4 text-rose-400" />
                             <span className="text-xs font-bold text-rose-400 uppercase">Stop Loss</span>
                          </div>
                          <span className="text-xl font-black text-rose-400">${(last.slPrice || (last.close * 0.99)).toLocaleString()}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chart Section */}
          <Card className="lg:col-span-3 bg-orange-950/20 border-orange-500/20 overflow-hidden flex flex-col min-h-[500px] backdrop-blur-sm shadow-2xl">
            <CardHeader className="border-b border-orange-500/10 flex flex-row items-center justify-between py-4 bg-orange-500/[0.02]">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  {symbol} <span className="text-zinc-400 font-normal text-sm">{timeframe} Chart</span>
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/5">
                  Live Data
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
                  <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center text-rose-400 p-4 text-center">
                  <p>{error}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={processedData} margin={{ top: 40, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      stroke="#4b5563"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      stroke="#4b5563"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      labelFormatter={(t) => new Date(t).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                    />
                    
                    {showZones && (
                      <>
                        <Line 
                          type="monotone" 
                          dataKey="upperBand" 
                          stroke="#f43f5e" 
                          strokeWidth={1} 
                          dot={false} 
                          opacity={0.3}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="lowerBand" 
                          stroke="#10b981" 
                          strokeWidth={1} 
                          dot={false} 
                          opacity={0.3}
                        />
                      </>
                    )}

                    {showTrail && (
                      <Line 
                        type="stepAfter" 
                        dataKey="superTrend" 
                        stroke={latest?.direction === -1 ? "#10b981" : "#f43f5e"} 
                        strokeWidth={2} 
                        dot={false} 
                      />
                    )}

                    {/* Heikin Ashi Candlesticks implementation */}
                    <Scatter 
                      data={processedData}
                      dataKey="haClose"
                      shape={(props: any) => {
                        const { cx, cy, payload, yAxis } = props;
                        if (isNaN(cx) || isNaN(cy) || !yAxis || !yAxis.scale) return null;
                        
                        // Use Heikin Ashi values for rendering
                        const open = payload.haOpen;
                        const close = payload.haClose;
                        const high = payload.haHigh;
                        const low = payload.haLow;

                        const isBullish = close >= open;
                        const color = isBullish ? '#10b981' : '#f43f5e';
                        
                        const candleWidth = 6;
                        const yOpen = yAxis.scale(open);
                        const yClose = yAxis.scale(close);
                        const yHigh = yAxis.scale(high);
                        const yLow = yAxis.scale(low);

                        return (
                          <g>
                            {/* Wick */}
                            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
                            {/* Body */}
                            <rect 
                              x={cx - candleWidth/2} 
                              y={Math.min(yOpen, yClose)} 
                              width={candleWidth} 
                              height={Math.max(Math.abs(yOpen - yClose), 1)} 
                              fill={color} 
                            />
                          </g>
                        );
                      }}
                    />

                    {/* Signals */}
                    {confirmationSignals && (
                      <>
                        <Scatter 
                          data={processedData.filter(d => d.zigzagSignal === 'BUY')} 
                          dataKey="close"
                          shape={(props: any) => {
                            const { cx, payload, yAxis } = props;
                            if (!yAxis || !yAxis.scale) return null;
                            const yPivot = yAxis.scale(payload.zigzagPivot);
                            if (isNaN(cx) || isNaN(yPivot)) return null;
                            return (
                              <g transform={`translate(${cx},${yPivot + 10})`}>
                                <path d="M0,-8 L8,8 L-8,8 Z" fill="#10b981" />
                              </g>
                            );
                          }}
                        />
                        <Scatter 
                          data={processedData.filter(d => d.zigzagSignal === 'SELL')} 
                          dataKey="close"
                          shape={(props: any) => {
                            const { cx, payload, yAxis } = props;
                            if (!yAxis || !yAxis.scale) return null;
                            const yPivot = yAxis.scale(payload.zigzagPivot);
                            if (isNaN(cx) || isNaN(yPivot)) return null;
                            return (
                              <g transform={`translate(${cx},${yPivot - 10})`}>
                                <path d="M0,8 L-8,-8 L8,-8 Z" fill="#f43f5e" />
                              </g>
                            );
                          }}
                        />
                        <Scatter 
                          data={processedData.filter(d => d.buySignal)} 
                          dataKey="close"
                          shape={(props: any) => {
                            const { cx, cy, payload, yAxis } = props;
                            if (isNaN(cx) || isNaN(cy) || !yAxis || !yAxis.scale) return null;
                            const yLow = yAxis.scale(payload.low);
                            return (
                              <g transform={`translate(${cx},${yLow + 15})`}>
                                <path d="M-8,10 L8,10 L8,-2 L0,-10 L-8,-2 Z" fill="#4ade80" />
                                <text x="0" y="4" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">B</text>
                                {payload.isStrong && <text x="0" y="14" textAnchor="middle" fill="#4ade80" fontSize="12" fontWeight="bold">+</text>}
                              </g>
                            );
                          }}
                        />
                        <Scatter 
                          data={processedData.filter(d => d.sellSignal)} 
                          dataKey="close"
                          shape={(props: any) => {
                            const { cx, cy, payload, yAxis } = props;
                            if (isNaN(cx) || isNaN(cy) || !yAxis || !yAxis.scale) return null;
                            const yHigh = yAxis.scale(payload.high);
                            return (
                              <g transform={`translate(${cx},${yHigh - 15})`}>
                                <path d="M-8,-10 L8,-10 L8,2 L0,10 L-8,2 Z" fill="#f43f5e" />
                                <text x="0" y="2" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">S</text>
                                {payload.isStrong && <text x="0" y="-12" textAnchor="middle" fill="#f43f5e" fontSize="12" fontWeight="bold">+</text>}
                              </g>
                            );
                          }}
                        />
                        <Line 
                          type="stepAfter" 
                          dataKey="slPrice" 
                          stroke="#ef4444" 
                          strokeDasharray="3 3"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line 
                          type="stepAfter" 
                          dataKey="tpPrice" 
                          stroke="#10b981" 
                          strokeDasharray="3 3"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls={false}
                        />
                      </>
                    )}
                    
                    {/* Contrarian Signals */}
                    {contrarianSignals && (
                      <>
                        <Scatter 
                          data={processedData.filter(d => d.contraBuy)} 
                          dataKey="low"
                          shape={(props: any) => {
                            const { cx, payload, yAxis } = props;
                            if (!yAxis || !yAxis.scale) return null;
                            const yLow = yAxis.scale(payload.low);
                            if (isNaN(cx) || isNaN(yLow)) return null;
                            return <circle cx={cx} cy={yLow + 25} r="4" fill="#a855f7" />;
                          }}
                        />
                        <Scatter 
                          data={processedData.filter(d => d.contraSell)} 
                          dataKey="high"
                          shape={(props: any) => {
                            const { cx, payload, yAxis } = props;
                            if (!yAxis || !yAxis.scale) return null;
                            const yHigh = yAxis.scale(payload.high);
                            if (isNaN(cx) || isNaN(yHigh)) return null;
                            return <circle cx={cx} cy={yHigh - 25} r="4" fill="#a855f7" />;
                          }}
                        />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* RSI Histogram Chart */}
          <Card className="lg:col-span-3 bg-orange-950/20 border-orange-500/20 overflow-hidden flex flex-col h-[250px] backdrop-blur-sm shadow-2xl">
            <CardHeader className="border-b border-orange-500/10 py-3 bg-orange-500/[0.02]">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                RSI Histogram <span className="text-zinc-400 font-normal text-xs">({rsiHistMAType})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    hide
                  />
                  <YAxis 
                    domain={[-100, 100]} 
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    labelFormatter={(t) => new Date(t).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                  />
                  <Bar dataKey="rsiHist">
                    {processedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(entry.rsiHist || 0) > 0 ? '#10b981' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Settings Sidebar */}
          <div className="space-y-6">
            <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
              <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Settings className="w-4 h-4 text-orange-500" /> Indicator Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">ATR Period</label>
                  <Input 
                    type="number" 
                    value={sensitivity} 
                    onChange={(e) => setSensitivity(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">ATR Multiplier</label>
                  <Input 
                    type="number" 
                    step="0.1"
                    value={multiplier} 
                    onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100 italic">Triple Confirmation Active</span>
                    <Badge className="bg-orange-500 text-[10px]">ON</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Studio Control Widget */}
            <Card className="bg-black/40 border border-white/5 backdrop-blur-sm overflow-hidden">
              <CardHeader className="py-3 px-4 bg-orange-500/[0.02] border-b border-orange-500/10">
                <CardTitle className="text-xs font-bold text-orange-500 uppercase flex items-center gap-2">
                   <Zap className="w-3 h-3" /> AI Studio Control
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                   <span className="text-xs text-zinc-400">Telegram Status</span>
                   <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px]">Connected</Badge>
                </div>
                
                <Button 
                   variant="outline" 
                   className="w-full text-xs h-9 border-orange-500/20 hover:bg-orange-500/10 text-orange-500 font-bold"
                   onClick={() => {
                      const last = processedData[processedData.length - 1];
                      if (last) {
                        setNotifications(prev => [{
                          id: Date.now().toString(),
                          symbol,
                          type: last.zigzagSignal || 'SIGNAL',
                          message: `Manual check for ${symbol}: Trend ${last.trend}`,
                          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                        }, ...prev]);
                      }
                   }}
                >
                   Test Signal
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-orange-950/20 border-orange-500/20">
              <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Settings className="w-4 h-4 text-orange-500" /> RSI Histogram Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">RSI Length</label>
                  <Input 
                    type="number" 
                    value={rsiHistLength} 
                    onChange={(e) => setRsiHistLength(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">MA Length</label>
                  <Input 
                    type="number" 
                    value={rsiHistMALength} 
                    onChange={(e) => setRsiHistMALength(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">Source</label>
                  <select 
                    value={rsiSource} 
                    onChange={(e) => setRsiSource(e.target.value as 'CLOSE' | 'HL2')}
                    className="w-full bg-orange-950/40 border border-orange-500/20 rounded-md h-8 text-sm px-2 focus:outline-none focus:ring-1 focus:ring-orange-500 text-zinc-100"
                  >
                    <option value="CLOSE">Close</option>
                    <option value="HL2">(H + L) / 2</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">MA Type</label>
                  <select 
                    value={rsiHistMAType} 
                    onChange={(e) => setRsiHistMAType(e.target.value)}
                    className="w-full bg-orange-950/40 border border-orange-500/20 rounded-md h-8 text-sm px-2 focus:outline-none focus:ring-1 focus:ring-orange-500 text-zinc-100"
                  >
                    {["NONE", "SMA", "EMA", "WMA", "HMA", "JMA", "KAMA"].map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {rsiHistMAType === 'KAMA' && (
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-100 uppercase font-medium">Kama's Alpha</label>
                    <Input 
                      type="number" 
                      value={kamaAlpha} 
                      onChange={(e) => setKamaAlpha(parseInt(e.target.value))}
                      className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-orange-950/20 border-orange-500/20">
              <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Activity className="w-4 h-4 text-orange-500" /> ZigZag Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">ZigZag Sensitivity (JMA)</label>
                  <Input 
                    type="number" 
                    value={zigzagLength} 
                    onChange={(e) => setZigzagLength(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">TP Ratio (1:X)</label>
                  <Input 
                    type="number" 
                    step={0.1}
                    value={tpRatio} 
                    onChange={(e) => setTpRatio(parseFloat(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">SL Lookback (Bars)</label>
                  <Input 
                    type="number" 
                    value={slLookback} 
                    onChange={(e) => setSlLookback(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-orange-950/20 border-orange-500/20">
              <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Bell className="w-4 h-4 text-orange-500" /> Alert Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-100">Auto-Alert (30m)</span>
                  <button 
                    onClick={() => setAutoAlert(!autoAlert)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative",
                      autoAlert ? "bg-orange-500" : "bg-orange-900/50"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                      autoAlert ? "translate-x-4.5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-100">Alert Sound</span>
                  <button 
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative",
                      soundEnabled ? "bg-orange-500" : "bg-orange-900/50"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                      soundEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-sm text-zinc-100 font-medium">Auto-Scan (5m)</span>
                  <button 
                    onClick={() => setAutoScan(!autoScan)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative",
                      autoScan ? "bg-orange-500" : "bg-orange-900/50"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                      autoScan ? "translate-x-4.5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-100 uppercase font-medium">Scan Lookback (Minutes)</label>
                    <span className="text-xs font-bold text-orange-500">{scanLookbackMinutes}m</span>
                  </div>
                  <Input 
                    type="number" 
                    min="1"
                    max="1440"
                    value={scanLookbackMinutes} 
                    onChange={(e) => setScanLookbackMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                  <div className="flex bg-black/40 rounded-lg p-1 border border-zinc-800">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn("h-7 text-[10px] flex-1 px-1", scanLookbackMinutes === 15 ? "bg-orange-500 text-white hover:bg-orange-600" : "text-zinc-400 hover:text-zinc-200")}
                      onClick={() => setScanLookbackMinutes(15)}
                    >
                      15M
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn("h-7 text-[10px] flex-1 px-1", scanLookbackMinutes === 30 ? "bg-orange-500 text-white hover:bg-orange-600" : "text-zinc-400 hover:text-zinc-200")}
                      onClick={() => setScanLookbackMinutes(30)}
                    >
                      30M
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn("h-7 text-[10px] flex-1 px-1", scanLookbackMinutes === 60 ? "bg-orange-500 text-white hover:bg-orange-600" : "text-zinc-400 hover:text-zinc-200")}
                      onClick={() => setScanLookbackMinutes(60)}
                    >
                      1H
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn("h-7 text-[10px] flex-1 px-1", scanLookbackMinutes === 240 ? "bg-orange-500 text-white hover:bg-orange-600" : "text-zinc-400 hover:text-zinc-200")}
                      onClick={() => setScanLookbackMinutes(240)}
                    >
                      4H
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">Filter signals confirmed within the last {scanLookbackMinutes} minutes.</p>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-4">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">Phone Notifications</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Send className="w-3 h-3 text-sky-400" />
                        <span className="text-xs text-zinc-300">Telegram Alerts</span>
                      </div>
                      <button 
                        onClick={() => setTelegramEnabled(!telegramEnabled)}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          telegramEnabled ? "bg-sky-500" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                          telegramEnabled ? "translate-x-4.5" : "translate-x-0.5"
                        )} />
                      </button>
                    </div>

                    {telegramEnabled && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                        <Input 
                          placeholder="Bot Token"
                          value={telegramToken}
                          onChange={(e) => setTelegramToken(e.target.value)}
                          className="bg-black/40 border-white/10 h-7 text-[10px] text-zinc-300"
                        />
                        <Input 
                          placeholder="Chat ID"
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          className="bg-black/40 border-white/10 h-7 text-[10px] text-zinc-300"
                        />
                        <p className="text-[9px] text-zinc-500 leading-tight">
                          Get Token from @BotFather and Chat ID from @userinfobot
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3 h-3 text-emerald-400" />
                        <span className="text-xs text-zinc-300">Browser Push</span>
                      </div>
                      <button 
                        onClick={() => {
                          if (!pushEnabled) requestNotificationPermission();
                          else setPushEnabled(false);
                        }}
                        className={cn(
                          "w-8 h-4 rounded-full transition-colors relative",
                          pushEnabled ? "bg-emerald-500" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                          pushEnabled ? "translate-x-4.5" : "translate-x-0.5"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
                {lastScanTime && (
                  <p className="text-[10px] text-zinc-500 text-right">
                    Last scan: {new Date(lastScanTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour12: false })}
                  </p>
                )}
                
                {alerts.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Active Alerts ({alerts.filter(a => !a.triggered).length})</p>
                    <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {alerts.slice().reverse().map((alert) => (
                        <div key={alert.id} className="flex justify-between items-center bg-white/[0.03] p-2 rounded border border-white/5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-white">{alert.symbol}</span>
                            <span className="text-[10px] text-zinc-400">
                              {alert.triggered ? 'Triggered' : `Due: ${new Date(alert.alertTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })}`}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-zinc-600 hover:text-rose-500"
                            onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
              <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Info className="w-4 h-4 text-orange-500" /> Signal Legend
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center text-[10px] font-bold text-black">B</div>
                  <span className="text-xs text-zinc-300">SuperTrend Buy</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-rose-500 rounded flex items-center justify-center text-[10px] font-bold text-black">S</div>
                  <span className="text-xs text-zinc-300">SuperTrend Sell</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-emerald-500 ml-1.5" />
                  <span className="text-xs text-zinc-300">Strategy Entry (Buy)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-rose-500 ml-1.5" />
                  <span className="text-xs text-zinc-300">Strategy Entry (Sell)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full ml-1.5 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                  <span className="text-xs text-zinc-300">Contrarian Signal</span>
                </div>
                <div className="mt-4 p-3 bg-white/[0.03] rounded-lg border border-white/5">
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Strategy: Triple Confirmation PRO (RSI Hist + Supertrend + ZigZag Jurik).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div id="scanner" className="space-y-6">
          <Card className="bg-orange-950/20 border-orange-500/20 min-h-[600px] backdrop-blur-sm shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-orange-500/10 flex flex-row items-center justify-between bg-orange-500/[0.02]">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  <ListFilter className="w-5 h-5 text-orange-500" /> Filtered Signals
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Rules: ZigZag Flip + Trend Alignment + RSI Hist + Strength
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-black/40 border-white/10 text-white">
                {scanResults.length} Signals / {totalSymbols || '---'} Coins
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-black/20">
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Symbol</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Strategy</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Signal</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Price</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-emerald-500">TP (1:2)</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-rose-500">Stop Loss</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Strength</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Time</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-center">Alert</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {scanResults.length === 0 && !scanning && (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-zinc-500">
                          No signals found. Click "Start Full Scan" to analyze the market.
                        </td>
                      </tr>
                    )}
                    {scanning && scanResults.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-12 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                            <div className="space-y-1">
                              <p className="text-zinc-100 font-medium">Scanning {totalSymbols} Binance Futures... {scanProgress}%</p>
                              <p className="text-zinc-500 text-xs font-mono">Analyzing {currentScanning}.P</p>
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
                              className="flex items-center gap-2 cursor-pointer group/copy"
                              onClick={() => copyToClipboard(`${res.symbol}.P`)}
                            >
                              <span className="font-bold text-zinc-100">{res.symbol}.P</span>
                              <div className="opacity-0 group-hover/copy:opacity-100 transition-opacity">
                                {copiedSymbol === `${res.symbol}.P` ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-xs text-zinc-500 whitespace-nowrap">
                            <Badge variant="outline" className={cn(
                              "border-none text-[10px] h-5",
                              res.source?.includes("ZigZag") ? "bg-purple-500/10 text-purple-400" : "bg-orange-500/10 text-orange-400"
                            )}>
                              {res.source || 'Strategy'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Badge className={cn(
                              "border-none",
                              res.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            )}>
                              {res.type}
                            </Badge>
                          </td>
                          <td className="p-4 font-mono text-zinc-300">${res.price.toLocaleString()}</td>
                          <td className="p-4 font-bold text-emerald-400 font-mono">${res.tpPrice?.toLocaleString() || '---'}</td>
                          <td className="p-4 font-bold text-rose-400 font-mono">${res.slPrice?.toLocaleString() || '---'}</td>
                          <td className="p-4">
                            {res.isStrong ? (
                              <Badge variant="outline" className="border-orange-500/50 text-orange-400 text-[10px] h-5">STRONG</Badge>
                            ) : (
                              <span className="text-zinc-600 text-xs">Normal</span>
                            )}
                          </td>
                          <td className="p-4 text-xs text-zinc-500">
                            {new Date(res.time).toLocaleTimeString('en-US', {
                              timeZone: 'Asia/Colombo'
                            })}
                          </td>
                          <td className="p-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                alerts.find(a => a.id === `${res.symbol}-${res.time}`) 
                                  ? "text-orange-500" 
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                              onClick={() => addAlert(res.symbol, res.type, res.time)}
                            >
                              {alerts.find(a => a.id === `${res.symbol}-${res.time}`) ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                            </Button>
                          </td>
                          <td className="p-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                              onClick={() => {
                                setSymbol(res.symbol);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              View Chart
                            </Button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div id="history" className="space-y-6">
          <Card className="bg-orange-950/20 border-orange-500/20 min-h-[600px] backdrop-blur-sm shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-orange-500/10 flex flex-row items-center justify-between bg-orange-500/[0.02]">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  <History className="w-5 h-5 text-purple-500" /> Signal History
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  History of all signals detected during scans.
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                onClick={() => setSignalHistory([])}
              >
                Clear History
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-black/20">
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Symbol</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Strategy</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Signal</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Price</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Signal Time</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Detected At</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {signalHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-zinc-500">
                          No signal history yet.
                        </td>
                      </tr>
                    ) : (
                       signalHistory.map((res) => (
                        <tr key={res.id} className="hover:bg-orange-500/5 transition-colors group">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-100">{res.symbol}.P</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-zinc-600 hover:text-orange-500"
                                onClick={() => copyToClipboard(res.symbol)}
                              >
                                {copiedSymbol === res.symbol ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              </Button>
                            </div>
                          </td>
                          <td className="p-4 text-xs text-zinc-500 whitespace-nowrap">
                            <Badge variant="outline" className={cn(
                              "border-none text-[10px] h-5",
                              res.source?.includes("ZigZag") ? "bg-purple-500/10 text-purple-400" : "bg-orange-500/10 text-orange-400"
                            )}>
                              {res.source || 'Strategy'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Badge className={cn(
                              "border-none",
                              res.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            )}>
                              {res.type}
                            </Badge>
                          </td>
                          <td className="p-4 font-mono text-zinc-300">${res.price.toLocaleString()}</td>
                          <td className="p-4 text-xs text-zinc-400 font-mono">
                            {new Date(res.time).toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour12: false })}
                          </td>
                          <td className="p-4 text-xs text-zinc-400 font-mono">
                            {new Date(res.scanTime).toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour12: false })}
                          </td>
                          <td className="p-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-xs text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                              onClick={() => {
                                setSymbol(res.symbol);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              View Chart
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        <div id="alerts" className="space-y-6">
          <Card className="bg-orange-950/20 border-orange-500/20 backdrop-blur-sm shadow-2xl">
            <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                    <BellRing className="w-5 h-5 text-orange-500" /> Alert Notifications
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    Real-time alerts for price targets and signal confirmations
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setNotificationHistory([])}
                  className="border-orange-500/20 hover:bg-orange-500/10 text-xs"
                >
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {notificationHistory.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bell className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500">No active alerts. Alerts will appear here when signals are triggered.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {notificationHistory.map((notif) => (
                      <div key={notif.id} className="p-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors group">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          notif.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                          {notif.type === 'BUY' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              {notif.symbol}.P 
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5 text-zinc-600 hover:text-orange-500"
                                onClick={() => copyToClipboard(notif.symbol)}
                              >
                                {copiedSymbol === notif.symbol ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              </Button>
                              <Badge className={cn(
                                "text-[10px] px-1.5 py-0",
                                notif.type === 'BUY' ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/20" : "bg-rose-500/20 text-rose-500 border-rose-500/20"
                              )}>
                                {notif.type}
                              </Badge>
                            </h4>
                            <span className="text-[10px] text-zinc-500 font-mono">{notif.time}</span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{notif.message}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-rose-500"
                          onClick={() => setNotificationHistory(prev => prev.filter(n => n.id !== notif.id))}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div id="settings" className="space-y-6">
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
                        <Input 
                          type="password" 
                          placeholder="123456789:ABC..." 
                          value={telegramToken}
                          onChange={(e) => setTelegramToken(e.target.value)}
                          className="bg-black/40 border-orange-500/20 h-10 text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
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
                      {scanning ? 'Testing...' : 'Test Connection'}
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
            </div>

            <div className="col-span-1 space-y-6">
              <Card className="bg-black/40 border border-white/5 backdrop-blur-sm overflow-hidden">
                <CardHeader className="py-3 px-4 bg-orange-500/[0.02] border-b border-orange-500/10">
                  <CardTitle className="text-xs font-bold text-orange-500 uppercase flex items-center gap-2">
                     <Send className="w-3 h-3" /> Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                   <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Telegram Status</span>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px]">Active</Badge>
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
    </main>
      {/* Notification Overlay */}
      <div className="fixed bottom-6 right-6 z-50 space-y-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className="bg-orange-950 border border-orange-500/50 p-4 rounded-xl shadow-2xl w-80 pointer-events-auto flex gap-4 items-start"
            >
              <div className="bg-orange-500/20 p-2 rounded-lg">
                <BellRing className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-bold text-zinc-100">Signal Alert</h4>
                  <span className="text-[10px] text-zinc-500">{notif.time}</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">{notif.message}</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] mt-2 text-zinc-500 hover:text-zinc-300 p-0"
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                >
                  Dismiss
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
