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
        console.error('Telegram Proxy Error:', errorData);
        throw new Error(errorData.error || 'Failed to send message');
      }
    } catch (e: any) {
      console.error('Telegram Error:', e);
      // Optional: set a UI error state if this was a manual test
      if (scanning) { // If called from testTelegram
        setError(`Telegram Error: ${e.message || 'Failed to connect to Bot API'}`);
      }
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

  const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> => {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, wait));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
      }
      return response;
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
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
      if (!exchangeInfoRes.ok) {
        throw new Error(`Failed to fetch exchange info: ${exchangeInfoRes.status}`);
      }
      const exchangeInfo = await exchangeInfoRes.json();
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
      const batchSize = 10; // Reduced batch size for better stability

      for (let i = 0; i < usdtSymbols.length; i += batchSize) {
        const batch = usdtSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (s, index) => {
          const currentIndex = i + index;
          if (currentIndex >= usdtSymbols.length) return;
          
          try {
            // Use local proxy to avoid CORS/Rate limits for scanner
            const klinesRes = await fetchWithRetry(`/api/klines?symbol=${encodeURIComponent(s)}&interval=${timeframe}&limit=500`);
            
            if (!klinesRes.ok) {
              const errData = await klinesRes.json().catch(() => ({ error: "Unknown error" }));
              if (klinesRes.status === 404 || klinesRes.status === 400) {
                // 400 often means invalid symbol on Binance
                return;
              }
              console.warn(`Scanner: [${s}] ${klinesRes.status} - ${errData.error}`);
              return;
            }
            
            const data = await klinesRes.json();
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
        
        // Minor pause to regulate API frequency and reduce CPU/Network load
        await new Promise(r => setTimeout(r, 500));
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
                           <td className="p-4 text-xs text-zinc-500 font-mono">
                             {new Date(res.time).toLocaleTimeString('en-US', {
                               timeZone: 'Asia/Colombo',
                               hour: '2-digit',
                               minute: '2-digit',
                               hour12: false
                             })} <span className="text-[10px] opacity-70">IST</span>
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
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
                </CardContent>
              </Card>
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
                      <label className="text-[10px] uppercase font-bold text-zinc-500">ATR Period</label>
                      <Input 
                        type="number" 
                        value={sensitivity} 
                        onChange={(e) => setSensitivity(parseInt(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">ATR Multiplier</label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={multiplier} 
                        onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                        className="bg-black/40 border-white/10 h-8 text-xs font-mono"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-orange-950/20 border-orange-500/20">
                  <CardHeader className="border-b border-orange-500/10 bg-orange-500/[0.02] py-3">
                    <CardTitle className="text-[11px] font-bold text-white uppercase flex items-center gap-2">
                       <Activity className="w-3 h-3 text-orange-500" /> ZigZag Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Sensitivity (JMA)</label>
                      <Input 
                        type="number" 
                        value={zigzagLength} 
                        onChange={(e) => setZigzagLength(parseInt(e.target.value))}
                        className="bg-black/40 border-white/10 h-7 text-[10px] font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">TP Ratio (1:X)</label>
                      <Input 
                        type="number" 
                        step={0.1}
                        value={tpRatio} 
                        onChange={(e) => setTpRatio(parseFloat(e.target.value))}
                        className="bg-black/40 border-white/10 h-7 text-[10px] font-mono"
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
                        value={scanLookbackMinutes} 
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
                      <span className="text-[10px] text-zinc-400">Triple Confirm Long</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-rose-500/20 text-rose-400 border-none text-[10px] py-0 h-5">SELL</Badge>
                      <span className="text-[10px] text-zinc-400">Triple Confirm Short</span>
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
                  <div 
                    className="flex items-center gap-2 cursor-pointer group/copy hover:bg-white/5 px-1.5 py-0.5 -ml-1.5 rounded transition-colors"
                    onClick={() => copyToClipboard(notif.symbol)}
                    title="Click to copy symbol"
                  >
                    <h4 className="text-sm font-bold text-zinc-100">{notif.symbol}</h4>
                    <div className="opacity-40 group-hover/copy:opacity-100 transition-opacity">
                      {copiedSymbol === notif.symbol ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-zinc-400" />
                      )}
                    </div>
                  </div>
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
