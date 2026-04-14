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
  VolumeX
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { processIndicators, Candle } from '@/src/lib/indicators';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Indicator Settings
  const [sensitivity, setSensitivity] = useState(7);
  const [multiplier, setMultiplier] = useState(1.5);
  const [useFilter, setUseFilter] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  // RSI Histogram Settings
  const [rsiHistLength, setRsiHistLength] = useState(16);
  const [rsiHistMALength, setRsiHistMALength] = useState(7);
  const [rsiHistMAType, setRsiHistMAType] = useState('KAMA');

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
  const [autoAlert, setAutoAlert] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Check for alerts every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setAlerts(prev => {
        const updated = prev.map(alert => {
          if (!alert.triggered && now >= alert.alertTime) {
            // Trigger alert
            const newNotification = {
              id: Math.random().toString(36).substr(2, 9),
              symbol: alert.symbol,
              type: alert.type,
              time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }),
              message: `30m Alert: ${alert.symbol} ${alert.type} signal reached!`
            };
            setNotifications(n => [newNotification, ...n].slice(0, 5));
            
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

  const addAlert = (symbol: string, type: string, signalTime: number) => {
    const alertTime = signalTime + (30 * 60 * 1000); // 30 minutes later
    const id = `${symbol}-${signalTime}`;
    
    if (alerts.find(a => a.id === id)) return; // Already exists

    setAlerts(prev => [...prev, {
      id,
      symbol,
      type,
      signalTime,
      alertTime,
      triggered: false
    }]);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSymbol(text);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  const startScan = async () => {
    setScanning(true);
    setScanResults([]);
    setScanProgress(0);
    
    try {
      // Fetch Binance Futures symbols
      const exchangeInfoRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
      const exchangeInfo = await exchangeInfoRes.json();
      const usdtSymbols = exchangeInfo.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);

      const total = usdtSymbols.length;
      setTotalSymbols(total);
      const results: any[] = [];
      const batchSize = 10; // Process 10 symbols at a time

      for (let i = 0; i < usdtSymbols.length; i += batchSize) {
        const batch = usdtSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (s, index) => {
          const currentIndex = i + index;
          if (currentIndex >= usdtSymbols.length) return;
          
          try {
            const klinesRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${timeframe}&limit=500`);
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
              rsiHistMAType
            });

            const last = processed[processed.length - 1];
            
            const isBuy = last.buySignal && (last.rsiHist || 0) > 0 && last.lastTouch === 'LOWER';
            const isSell = last.sellSignal && (last.rsiHist || 0) < 0 && last.lastTouch === 'UPPER';

            if (isBuy || isSell) {
              const signalData = {
                symbol: s,
                type: isBuy ? 'BUY' : 'SELL',
                price: last.close,
                time: last.time,
                isStrong: last.isStrong,
                lastTouch: last.lastTouch,
                lastTouchTime: last.lastTouchTime
              };
              results.push(signalData);
              
              if (autoAlert) {
                addAlert(s, signalData.type, last.time);
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
        
        // Small pause between batches to be safe with rate limits
        await new Promise(r => setTimeout(r, 50));
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
      rsiHistMAType
    });
  }, [candles, sensitivity, multiplier, useFilter, rsiHistLength, rsiHistMALength, rsiHistMAType]);

  const latest = processedData[processedData.length - 1];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              CryptoPulse <span className="text-emerald-500 font-mono text-sm ml-1">v1.0</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              {['15m', '1h', '4h', '1d'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    timeframe === tf 
                      ? "bg-zinc-800 text-white shadow-sm" 
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              {SYMBOLS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    symbol === s 
                      ? "bg-zinc-800 text-white shadow-sm" 
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => fetchData(symbol, timeframe)}
              className="border-zinc-800 hover:bg-zinc-800"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="chart" className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Chart
              </TabsTrigger>
              <TabsTrigger value="scanner" className="flex items-center gap-2">
                <Search className="w-4 h-4" /> Market Scanner
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'scanner' && (
              <Button 
                onClick={startScan} 
                disabled={scanning}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
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
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-zinc-100 uppercase tracking-wider mb-1">Current Price</p>
                  <h3 className="text-2xl font-bold font-mono text-white">
                    ${latest?.close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </h3>
                </div>
                <Badge className={cn(
                  "bg-opacity-20 border-none",
                  latest?.trend === 'BULLISH' ? "bg-emerald-500 text-emerald-400" : "bg-rose-500 text-rose-400"
                )}>
                  {latest?.trend}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-zinc-100 uppercase tracking-wider mb-1">Last Band Touch</p>
                  <h3 className={cn(
                    "text-2xl font-bold font-mono",
                    (latest as any)?.lastTouch === 'UPPER' ? "text-rose-400" : (latest as any)?.lastTouch === 'LOWER' ? "text-emerald-400" : "text-zinc-100"
                  )}>
                    {(latest as any)?.lastTouch || 'NONE'}
                  </h3>
                </div>
                <Target className={cn("w-5 h-5", (latest as any)?.lastTouch === 'UPPER' ? "text-rose-500" : (latest as any)?.lastTouch === 'LOWER' ? "text-emerald-500" : "text-zinc-500")} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-zinc-100 uppercase tracking-wider mb-1">Market Strength</p>
                  <h3 className={cn(
                    "text-2xl font-bold font-mono",
                    latest?.isStrong ? "text-emerald-400" : "text-orange-400"
                  )}>
                    {latest?.isStrong ? 'STRONG' : 'NORMAL'}
                  </h3>
                </div>
                <Activity className={cn("w-5 h-5", latest?.isStrong ? "text-emerald-500" : "text-orange-500")} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-zinc-100 uppercase tracking-wider mb-1">ADX Value</p>
                  <h3 className="text-2xl font-bold font-mono text-white">
                    {latest?.adx?.toFixed(2) || '---'}
                  </h3>
                </div>
                <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden mt-3">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${Math.min((latest?.adx || 0) * 2, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-zinc-100 uppercase tracking-wider mb-1">RSI (14)</p>
                  <h3 className={cn(
                    "text-2xl font-bold font-mono",
                    (latest?.rsi || 50) > 70 ? "text-rose-400" : (latest?.rsi || 50) < 30 ? "text-emerald-400" : "text-zinc-100"
                  )}>
                    {latest?.rsi?.toFixed(2) || '---'}
                  </h3>
                </div>
                <div className="flex flex-col gap-1">
                  <div className={cn("w-2 h-2 rounded-full", (latest?.rsi || 50) > 70 ? "bg-rose-500 animate-pulse" : "bg-zinc-800")} title="Overbought" />
                  <div className={cn("w-2 h-2 rounded-full", (latest?.rsi || 50) < 30 ? "bg-emerald-500 animate-pulse" : "bg-zinc-800")} title="Oversold" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chart Section */}
          <Card className="lg:col-span-3 bg-zinc-900/50 border-zinc-800 overflow-hidden flex flex-col min-h-[500px]">
            <CardHeader className="border-b border-zinc-800/50 flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  {symbol} <span className="text-zinc-500 font-normal text-sm">{timeframe} Chart</span>
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/5">
                  Live Data
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
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
                    
                    {/* Contrarian Signals */}
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
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* RSI Histogram Chart */}
          <Card className="lg:col-span-3 bg-zinc-900/50 border-zinc-800 overflow-hidden flex flex-col h-[250px]">
            <CardHeader className="border-b border-zinc-800/50 py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                RSI Histogram <span className="text-zinc-500 font-normal text-xs">({rsiHistMAType})</span>
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
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-100">
                  <Settings className="w-4 h-4" /> Indicator Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">Sensitivity</label>
                  <Input 
                    type="number" 
                    value={sensitivity} 
                    onChange={(e) => setSensitivity(parseInt(e.target.value))}
                    className="bg-zinc-950 border-zinc-800 h-8 text-sm text-zinc-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">Multiplier</label>
                  <Input 
                    type="number" 
                    step="0.1"
                    value={multiplier} 
                    onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                    className="bg-zinc-950 border-zinc-800 h-8 text-sm text-zinc-100"
                  />
                </div>
                
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-100">Trend Filter</span>
                    <button 
                      onClick={() => setUseFilter(!useFilter)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        useFilter ? "bg-emerald-500" : "bg-zinc-700"
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
                        showTrail ? "bg-emerald-500" : "bg-zinc-700"
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
                        showZones ? "bg-emerald-500" : "bg-zinc-700"
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

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-100">
                  <Settings className="w-4 h-4" /> RSI Histogram Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">RSI Length</label>
                  <Input 
                    type="number" 
                    value={rsiHistLength} 
                    onChange={(e) => setRsiHistLength(parseInt(e.target.value))}
                    className="bg-zinc-950 border-zinc-800 h-8 text-sm text-zinc-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">MA Length</label>
                  <Input 
                    type="number" 
                    value={rsiHistMALength} 
                    onChange={(e) => setRsiHistMALength(parseInt(e.target.value))}
                    className="bg-zinc-950 border-zinc-800 h-8 text-sm text-zinc-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-100 uppercase font-medium">MA Type</label>
                  <select 
                    value={rsiHistMAType} 
                    onChange={(e) => setRsiHistMAType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md h-8 text-sm px-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-100"
                  >
                    {["NONE", "SMA", "EMA", "WMA", "HMA", "JMA", "KAMA"].map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-100">
                  <Bell className="w-4 h-4" /> Alert Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-100">Auto-Alert (30m)</span>
                  <button 
                    onClick={() => setAutoAlert(!autoAlert)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative",
                      autoAlert ? "bg-emerald-500" : "bg-zinc-700"
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
                      soundEnabled ? "bg-emerald-500" : "bg-zinc-700"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                      soundEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
                
                {alerts.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Active Alerts ({alerts.filter(a => !a.triggered).length})</p>
                    <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {alerts.slice().reverse().map((alert) => (
                        <div key={alert.id} className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-800">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-100">{alert.symbol}</span>
                            <span className="text-[10px] text-zinc-500">
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

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-100">
                  <Info className="w-4 h-4" /> Signal Legend
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center text-[10px] font-bold">B</div>
                  <span className="text-xs text-zinc-300">Confirmation Buy</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-rose-500 rounded flex items-center justify-center text-[10px] font-bold">S</div>
                  <span className="text-xs text-zinc-300">Confirmation Sell</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full ml-1.5" />
                  <span className="text-xs text-zinc-300">Contrarian Signal</span>
                </div>
                <div className="mt-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
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
          <Card className="bg-zinc-900/50 border-zinc-800 min-h-[600px]">
            <CardHeader className="border-b border-zinc-800/50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <ListFilter className="w-5 h-5 text-emerald-500" /> Filtered Signals
                </CardTitle>
                <CardDescription className="text-zinc-300">
                  Binance Futures (USDT Pairs) • Rules: Lux Signal + RSI Hist + Last Band Touch
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-zinc-950 border-zinc-800">
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
                            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
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
                          key={res.symbol}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="hover:bg-zinc-800/30 transition-colors group"
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
                              <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-[10px] h-5">STRONG</Badge>
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
                                  ? "text-emerald-500" 
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
                              className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
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
      </Tabs>
    </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-zinc-500">
            © 2026 CryptoPulse Analysis. Data provided by Binance API.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-zinc-500 hover:text-emerald-500 transition-colors">Documentation</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-emerald-500 transition-colors">API Status</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-emerald-500 transition-colors">Risk Warning</a>
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
              className="bg-zinc-900 border border-emerald-500/50 p-4 rounded-xl shadow-2xl w-80 pointer-events-auto flex gap-4 items-start"
            >
              <div className="bg-emerald-500/20 p-2 rounded-lg">
                <BellRing className="w-5 h-5 text-emerald-500" />
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
