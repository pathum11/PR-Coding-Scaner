
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  fairValue: number | null;
  upper1: number | null;
  upper2: number | null;
  upper3: number | null;
  lower1: number | null;
  lower2: number | null;
  lower3: number | null;
  buySignal: boolean;
  sellSignal: boolean;
  trend: 'BULLISH' | 'BEARISH';
  slPrice: number | null;
  tpPrice: number | null;
  position: 'LONG' | 'SHORT' | null;
  recommendedLeverage: number;
}

export interface IndicatorSettings {
  bw: number;
  alpha: number;
  period: number;
  phase: number;
  filter: 'No Filter' | 'Smooth' | 'Zero Lag';
  baseMult: number;
  spacingMode: 'Linear' | 'Exponential';
  sigmaWindow: number;
  useConfluence: boolean;
  warmupBars: number;
  cooldownGap: number;
  signalMode: 'Confirmed' | 'Realtime';
  slPnL: number;
  tpPnL: number;
  tradeAmount: number;
  leverage: number;
}

// Rational Quadratic Kernel
function rationalQuadraticKernel(distance: number, bandwidth: number, alpha: number): number {
  if (alpha === 0) return 0;
  return Math.pow(1 + (distance * distance) / (2 * alpha * bandwidth * bandwidth), -alpha);
}

export function calculateKernelRegression(src: number[], settings: IndicatorSettings): number[] {
  const n = src.length;
  const result: number[] = new Array(n);
  
  for (let i = 0; i < n; i++) {
    let sumWeight = 0;
    let sumVal = 0;
    // Apply phase offset
    const targetIdx = Math.max(0, i - settings.phase);
    const lookback = Math.min(targetIdx, settings.bw * 4);
    
    for (let j = targetIdx - lookback; j <= targetIdx; j++) {
      const dist = targetIdx - j;
      const weight = rationalQuadraticKernel(dist, settings.bw, settings.alpha);
      sumWeight += weight;
      sumVal += weight * src[j];
    }
    result[i] = sumWeight > 0 ? sumVal / sumWeight : src[i];
  }
  
  // Apply Filter: Smooth (simple moving average for this filter)
  if (settings.filter === 'Smooth') {
    return result.map((v, i) => i > 0 ? (v + result[i-1]) / 2 : v);
  }
  return result;
}

export function processIndicators(candles: Candle[], settings: IndicatorSettings) {
  if (!candles || candles.length === 0) return [];

  const close = candles.map(c => c.close);
  const fairValue = calculateKernelRegression(close, settings);
  
  // Calculate Standard Deviation of residuals
  const residuals = close.map((c, i) => c - fairValue[i]);
  const rollingStdev: number[] = new Array(close.length);

  for (let i = 0; i < close.length; i++) {
    const start = Math.max(0, i - settings.sigmaWindow + 1);
    const slice = residuals.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
    rollingStdev[i] = Math.sqrt(variance);
  }

  const k1 = 1.0;
  const k2 = 2.0;
  const k3 = settings.spacingMode === 'Exponential' ? 4.0 : 3.0;

  let currentSlPrice: number | null = null;
  let currentTpPrice: number | null = null;
  let position: 'LONG' | 'SHORT' | null = null;
  let lastSignalBar = -10000; 
  let lastTrendFlip = -100;

  const notional = settings.tradeAmount * settings.leverage;

  return candles.map((candle, i) => {
    const fv = fairValue[i];
    const σ = rollingStdev[i];
    const dev = settings.baseMult * σ;

    const u1 = fv + k1 * dev;
    const u2 = fv + k2 * dev;
    const u3 = fv + k3 * dev;
    const l1 = fv - k1 * dev;
    const l2 = fv - k2 * dev;
    const l3 = fv - k3 * dev;

    const prevCandle = i > 0 ? candles[i - 1] : candle;
    const currentSlope = i > 0 ? fairValue[i] - fairValue[i - 1] : 0;
    const currentTrend = currentSlope >= 0 ? 'BULLISH' : 'BEARISH';
    
    // Trend Flip Detection
    if (i > 0) {
      const prevTrend = fairValue[i - 1] >= (i > 1 ? fairValue[i - 2] : fairValue[i - 1]) ? 'BULLISH' : 'BEARISH';
      if (currentTrend !== prevTrend) {
        lastTrendFlip = i;
      }
    }
    
    // Artemis Signal Logic: Poke-and-reverse (using outermost band)
    const triggerUp = u3;
    const triggerDn = l3;

    // Gate 1: Crossover/Poke-and-Reverse
    const rawSell = prevCandle.high > triggerUp && candle.close < triggerUp;
    const rawBuy = prevCandle.low < triggerDn && candle.close > triggerDn;
    
    // Gate 2: Warm-up (σ must be computable)
    const stableOK = i > settings.warmupBars;

    // Gate 3: Confluence
    const confSell = !settings.useConfluence || currentSlope <= 0;
    const confBuy = !settings.useConfluence || currentSlope >= 0;

    // Gate 4: Cooldown
    const cooldownOk = (i - lastSignalBar) > settings.cooldownGap;
    
    // Gate 5: 30-Candle Window after Trend Flip
    const withinWindow = (i - lastTrendFlip) <= 30;

    let buySignal = rawBuy && stableOK && confBuy && cooldownOk && withinWindow;
    let sellSignal = rawSell && stableOK && confSell && cooldownOk && withinWindow;

    if (buySignal) {
      lastSignalBar = i;
      const priceChangeTP = (settings.tpPnL / notional) * candle.close;
      const priceChangeSL = (settings.slPnL / notional) * candle.close;
      currentSlPrice = Math.round((candle.close - priceChangeSL) * 10000) / 10000;
      currentTpPrice = Math.round((candle.close + priceChangeTP) * 10000) / 10000;
      position = 'LONG';
    } else if (sellSignal) {
      lastSignalBar = i;
      const priceChangeTP = (settings.tpPnL / notional) * candle.close;
      const priceChangeSL = (settings.slPnL / notional) * candle.close;
      currentSlPrice = Math.round((candle.close + priceChangeSL) * 10000) / 10000;
      currentTpPrice = Math.round((candle.close - priceChangeTP) * 10000) / 10000;
      position = 'SHORT';
    }

    if (position === 'LONG' && currentSlPrice !== null && (candle.low <= currentSlPrice || candle.high >= (currentTpPrice || 0))) {
      position = null;
      currentSlPrice = null;
      currentTpPrice = null;
    } else if (position === 'SHORT' && currentSlPrice !== null && (candle.high >= currentSlPrice || candle.low <= (currentTpPrice || 0))) {
      position = null;
      currentSlPrice = null;
      currentTpPrice = null;
    }

    return {
      ...candle,
      fairValue: fv,
      upper1: u1,
      upper2: u2,
      upper3: u3,
      lower1: l1,
      lower2: l2,
      lower3: l3,
      buySignal,
      sellSignal,
      trend: currentSlope >= 0 ? 'BULLISH' : 'BEARISH',
      slPrice: currentSlPrice,
      tpPrice: currentTpPrice,
      position: position,
      recommendedLeverage: settings.leverage
    };
  });
}
