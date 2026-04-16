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
  ReferenceDot,
  ComposedChart,
  Scatter,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
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
  Globe
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
  const [sensitivity, setSensitivity] = useState(7);
  const [multiplier, setMultiplier] = useState(4.3);
  const [useFilter, setUseFilter] = useState(false);
  const [confirmationSignals, setConfirmationSignals] = useState(true);
  const [contrarianSignals, setContrarianSignals] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  // RSI Histogram Settings
  const [rsiHistLength, setRsiHistLength] = useState(16);
  const [rsiHistMALength, setRsiHistMALength] = useState(7);
  const [rsiHistMAType, setRsiHistMAType] = useState('KAMA');
  const [rsiSource, setRsiSource] = useState<'CLOSE' | 'HL2'>('HL2');
  const [kamaAlpha, setKamaAlpha] = useState(3);

  // Scanner State
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [currentScanning, setCurrentScanning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('chart');
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  // Alert System State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [autoAlert, setAutoAlert] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [scanLookbackHours, setScanLookbackHours] = useState(10);
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
            if (data.scanLookbackHours !== undefined) setScanLookbackHours(data.scanLookbackHours);
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
        scanLookbackHours,
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
  }, [telegramEnabled, telegramToken, telegramChatId, autoScan, sensitivity, multiplier, useFilter, scanLookbackHours, user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error('Login Error:', e);
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
      const exchangeInfoRes = await fetchWithRetry('https://fapi.binance.com/fapi/v1/exchangeInfo');
      const exchangeInfo = await exchangeInfoRes.json();
      const usdtSymbols = exchangeInfo.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);

      const total = usdtSymbols.length;
      setTotalSymbols(total);
      const results: any[] = [];
      const batchSize = 5; // Reduced batch size for stability

      for (let i = 0; i < usdtSymbols.length; i += batchSize) {
        const batch = usdtSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (s, index) => {
          const currentIndex = i + index;
          if (currentIndex >= usdtSymbols.length) return;
          
          try {
            const klinesRes = await fetchWithRetry(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${timeframe}&limit=500`);
            if (!klinesRes.ok) return;
            
            const data = await klinesRes.json();
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
              rsiSource
            });

            const now = Date.now();
            const lookbackMs = scanLookbackHours * 60 * 60 * 1000;
            const lookbackLimit = now - lookbackMs;
            
            // Find the most recent signal within the lookback window
            let foundSignal = null;
            for (let j = processed.length - 1; j >= 0; j--) {
              const candle = processed[j];
              if (candle.time < lookbackLimit) break;
              
              const isBuy = candle.buySignal && (candle.rsiHist || 0) > 0 && candle.lastTouch === 'LOWER';
              const isSell = candle.sellSignal && (candle.rsiHist || 0) < 0 && candle.lastTouch === 'UPPER';
              
              if (isBuy || isSell) {
                foundSignal = {
                  candle,
                  type: isBuy ? 'BUY' : 'SELL' as 'BUY' | 'SELL'
                };
                break;
              }
            }

            if (foundSignal) {
              const { candle, type } = foundSignal;
              const signalData = {
                id: `${s}-${candle.time}`,
                symbol: s,
                type: type,
                price: candle.close,
                time: candle.time,
                isStrong: candle.isStrong,
                lastTouch: candle.lastTouch,
                lastTouchTime: candle.lastTouchTime,
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
            console.error(`Error scanning ${s}:`, e);
          }
        }));

        // Update progress and results after each batch
        const progress = Math.min(100, Math.round(((i + batch.length) / total) * 100));
        setScanProgress(progress);
        setCurrentScanning(batch[batch.length - 1]);
        
        const sortedResults = [...results].sort((a, b) => (b.lastTouchTime || 0) - (a.lastTouchTime || 0));
        setScanResults(sortedResults);
        
        // Increased pause between batches to prevent rate limits
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
      const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${currentSymbol}&interval=${currentTF}&limit=100`);
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
      rsiSource
    });
  }, [candles, sensitivity, multiplier, useFilter, rsiHistLength, rsiHistMALength, rsiHistMAType, kamaAlpha, rsiSource]);

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-orange-900/40 border border-orange-500/30">
              <TabsTrigger value="chart" className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-black">
                <LayoutDashboard className="w-4 h-4" /> Chart
              </TabsTrigger>
              <TabsTrigger value="scanner" className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-black">
                <Search className="w-4 h-4" /> Market Scanner
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-black">
                <History className="w-4 h-4" /> Signal History
              </TabsTrigger>
              <TabsTrigger value="alerts" className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-black relative">
                <Bell className="w-4 h-4" /> Alerts
                {notificationHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                )}
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'scanner' && (
              <Button 
                onClick={startScan} 
                disabled={scanning}
                className="bg-orange-600 hover:bg-orange-500 text-white gap-2 shadow-[0_0_15px_rgba(234,88,12,0.3)]"
              >
                {scanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning {scanProgress}% ({currentScanning}.P)
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Start Full Scan
                  </>
                )}
              </Button>
            )}
          </div>

          <TabsContent value="chart" className="space-y-6 mt-0">
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
                  <label className="text-xs text-zinc-100 uppercase font-medium">Sensitivity</label>
                  <Input 
                    type="number" 
                    value={sensitivity} 
                    onChange={(e) => setSensitivity(parseInt(e.target.value))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">Multiplier</label>
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
                    <span className="text-sm text-zinc-100">Confirmation Signals</span>
                    <button 
                      onClick={() => setConfirmationSignals(!confirmationSignals)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        confirmationSignals ? "bg-orange-500" : "bg-orange-900/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                        confirmationSignals ? "translate-x-4.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">Contrarian Signals</span>
                    <button 
                      onClick={() => setContrarianSignals(!contrarianSignals)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        contrarianSignals ? "bg-orange-500" : "bg-orange-900/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                        contrarianSignals ? "translate-x-4.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">Trend Filter</span>
                    <button 
                      onClick={() => setUseFilter(!useFilter)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        useFilter ? "bg-orange-500" : "bg-orange-900/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                        useFilter ? "translate-x-4.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">Smart Trail</span>
                    <button 
                      onClick={() => setShowTrail(!showTrail)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        showTrail ? "bg-orange-500" : "bg-orange-900/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                        showTrail ? "translate-x-4.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">Reversal Zones</span>
                    <button 
                      onClick={() => setShowZones(!showZones)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        showZones ? "bg-orange-500" : "bg-orange-900/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                        showZones ? "translate-x-4.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                </div>
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
                    <label className="text-xs text-zinc-100 uppercase font-medium">Scan Lookback (Hours)</label>
                    <span className="text-xs font-bold text-orange-500">{scanLookbackHours}h</span>
                  </div>
                  <Input 
                    type="number" 
                    min="1"
                    max="168"
                    value={scanLookbackHours} 
                    onChange={(e) => setScanLookbackHours(Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-orange-950/40 border-orange-500/20 h-8 text-sm text-zinc-100 focus:border-orange-500/50"
                  />
                  <p className="text-[10px] text-zinc-500 italic">Filter signals confirmed within the last {scanLookbackHours} hours.</p>
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
                  <span className="text-xs text-zinc-300">Confirmation Buy</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-rose-500 rounded flex items-center justify-center text-[10px] font-bold text-black">S</div>
                  <span className="text-xs text-zinc-300">Confirmation Sell</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full ml-1.5 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                  <span className="text-xs text-zinc-300">Contrarian Signal</span>
                </div>
                <div className="mt-4 p-3 bg-white/[0.03] rounded-lg border border-white/5">
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Signals are generated based on Supertrend crossovers and RSI/Bollinger Band reversals.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

        <TabsContent value="scanner" className="mt-0">
          <Card className="bg-orange-950/20 border-orange-500/20 min-h-[600px] backdrop-blur-sm shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-orange-500/10 flex flex-row items-center justify-between bg-orange-500/[0.02]">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  <ListFilter className="w-5 h-5 text-orange-500" /> Filtered Signals
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Binance Futures (USDT Pairs) • Rules: Lux Signal + RSI Hist + Last Band Touch
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
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Signal</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Price</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Last Touch</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Touch Time</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Strength</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase">Time</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-center">Alert</th>
                      <th className="p-4 text-xs font-medium text-zinc-400 uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {scanResults.length === 0 && !scanning && (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-zinc-500">
                          No signals found. Click "Start Full Scan" to analyze the market.
                        </td>
                      </tr>
                    )}
                    {scanning && scanResults.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-12 text-center">
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
                          <td className="p-4">
                            <Badge className={cn(
                              "border-none",
                              res.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            )}>
                              {res.type}
                            </Badge>
                          </td>
                          <td className="p-4 font-mono text-zinc-300">${res.price.toLocaleString()}</td>
                          <td className="p-4">
                            {res.lastTouch ? (
                              <Badge variant="outline" className={cn(
                                "text-[10px] h-5",
                                res.lastTouch === 'UPPER' ? "border-rose-500/50 text-rose-400" : "border-emerald-500/50 text-emerald-400"
                              )}>
                                {res.lastTouch}
                              </Badge>
                            ) : (
                              <span className="text-zinc-600 text-xs">---</span>
                            )}
                          </td>
                          <td className="p-4 text-xs text-zinc-400 font-mono">
                            {res.lastTouchTime ? new Date(res.lastTouchTime).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              timeZone: 'Asia/Colombo'
                            }) : '---'}
                          </td>
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
                                setActiveTab('chart');
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
        </TabsContent>

        <TabsContent value="history" className="mt-0">
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
                                setActiveTab('chart');
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
        </TabsContent>
        <TabsContent value="alerts" className="space-y-6 mt-0">
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
        </TabsContent>
      </Tabs>
    </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-zinc-500">
            © 2026 CryptoPulse Analysis. Data provided by Binance API.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-zinc-500 hover:text-orange-500 transition-colors">Documentation</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-orange-500 transition-colors">API Status</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-orange-500 transition-colors">Risk Warning</a>
          </div>
        </div>
      </footer>
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
