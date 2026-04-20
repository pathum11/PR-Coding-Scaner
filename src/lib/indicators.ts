
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  superTrend: number | null;
  direction: number; // 1 for bearish, -1 for bullish
  upperBand: number | null;
  lowerBand: number | null;
  rsi: number | null;
  rsiHist: number | null;
  buySignal: boolean;
  sellSignal: boolean;
  trend: string;
  slPrice: number | null;
  tpPrice: number | null;
  recommendedLeverage: number | null;
  position: 'LONG' | 'SHORT' | null;
}

export function calculateATR(high: number[], low: number[], close: number[], period: number): (number | null)[] {
  const tr: number[] = [high[0] - low[0]];
  for (let i = 1; i < high.length; i++) {
    tr.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    ));
  }
  
  const atr: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      if (i === period - 1) {
        atr.push(sum / period);
      } else {
        atr.push(null);
      }
    } else {
      const prevATR = atr[i - 1]!;
      atr.push((prevATR * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

export function calculateSupertrend(high: number[], low: number[], close: number[], period: number, multiplier: number) {
  const atr = calculateATR(high, low, close, period);
  const superTrend: (number | null)[] = [];
  const direction: number[] = []; // 1: bearish, -1: bullish

  let prevUpper = 0;
  let prevLower = 0;
  let prevDir = 1;

  for (let i = 0; i < close.length; i++) {
    const currentATR = atr[i];
    if (currentATR === null) {
      superTrend.push(null);
      direction.push(1);
      continue;
    }

    const hl2 = (high[i] + low[i]) / 2;
    let basicUpper = hl2 + multiplier * currentATR;
    let basicLower = hl2 - multiplier * currentATR;

    let finalUpper = (basicUpper < prevUpper || i === 0 || close[i - 1] > prevUpper) ? basicUpper : prevUpper;
    let finalLower = (basicLower > prevLower || i === 0 || close[i - 1] < prevLower) ? basicLower : prevLower;

    let currentDir = prevDir;
    if (prevDir === 1 && close[i] > finalUpper) {
      currentDir = -1;
    } else if (prevDir === -1 && close[i] < finalLower) {
      currentDir = 1;
    }

    const currentST = currentDir === -1 ? finalLower : finalUpper;
    superTrend.push(currentST);
    direction.push(currentDir);

    prevUpper = finalUpper;
    prevLower = finalLower;
    prevDir = currentDir;
  }

  return { superTrend, direction };
}

export function calculateRSI(close: number[], period: number): (number | null)[] {
  const results: (number | null)[] = new Array(close.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < close.length; i++) {
    const change = close[i] - close[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        results[i] = 100 - (100 / (1 + rs));
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      results[i] = 100 - (100 / (1 + rs));
    }
  }
  return results;
}

// --- JURIK SMOOTHING FUNCTION (JMA) ---
// Translated from Pine:
// beta = 0.45 * (len - 1) / (0.45 * (len - 1) + 2)
// alpha = pow(beta, power)
// e0 = (1-alpha)*src + alpha*e0[1]
// e1 = (src-e0)*(1-beta) + beta*e1[1]
// e2 = e0 + phase*e1
export function calculateJMA(src: number[], length: number, phase: number, power: number): (number | null)[] {
  const jma: (number | null)[] = new Array(src.length).fill(null);
  let e0 = 0;
  let e1 = 0;
  
  const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
  const alpha = Math.pow(beta, power);

  for (let i = 0; i < src.length; i++) {
    const val = src[i];
    if (val === null || isNaN(val)) {
      jma[i] = null;
      continue;
    }

    if (i === 0) {
      e0 = val;
      e1 = 0;
    } else {
      e0 = (1 - alpha) * val + alpha * e0;
      e1 = (val - e0) * (1 - beta) + beta * e1;
    }
    
    // phase in pine is often between -100 and 100. The pine code for phase is `phase * e1`.
    // In pine code provided: `e2 := (e0 + _phase * e1)` where _phase is literally the input (usually 50)
    // But JMA usually uses (phase / 100) or similar. I'll stick to the provided pine logic exactly.
    // However, usually JMA has a more complex internal structure. I will follow the user's snippet exactly.
    const e2 = e0 + phase * e1;
    jma[i] = e2;
  }
  return jma;
}

export function processIndicators(candles: Candle[], settings: { 
  stSense: number, 
  stMult: number,
  rsiLen: number,
  rsiSm: number,
  slPct: number,
  tpPct: number
}) {
  if (!candles || candles.length === 0) return [];

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  
  const { superTrend, direction } = calculateSupertrend(high, low, close, settings.stSense, settings.stMult);
  const rsi = calculateRSI(close, settings.rsiLen);
  
  // rsiHist = f_jma(rsiVal - 50, rsiSm, 50, 2)
  const rsiMinus50 = rsi.map(r => r === null ? 0 : r - 50);
  const rsiHist = calculateJMA(rsiMinus50, settings.rsiSm, 50, 2);

  let currentSlPrice: number | null = null;
  let currentTpPrice: number | null = null;
  let position: 'LONG' | 'SHORT' | null = null;
  let hasSignalInTrend = false;

  return candles.map((candle, i) => {
    const currentST = superTrend[i];
    const currentDir = direction[i];
    const prevDir = i > 0 ? direction[i - 1] : currentDir;
    
    // Trend change detection
    if (currentDir !== prevDir) {
      hasSignalInTrend = false;
    }

    const rsiVal = rsi[i];
    const rsiH = rsiHist[i] || 0;

    const isStBullish = currentDir === -1;
    const isStBearish = currentDir === 1;
    const isRsiBullish = rsiH > 0;
    const isRsiBearish = rsiH < 0;

    const buySync = isStBullish && isRsiBullish;
    const sellSync = isStBearish && isRsiBearish;

    let buySignal = !hasSignalInTrend && buySync;
    let sellSignal = !hasSignalInTrend && sellSync;

    if (buySignal || sellSignal) {
      hasSignalInTrend = true;
    }

    // SL/TP Calculation (Modified for Fixed Percentage)
    const slFactor = settings.slPct / 100;
    const tpFactor = settings.tpPct / 100;

    if (buySignal) {
      const sl = candle.close * (1.0 - slFactor);
      const tp = candle.close * (1.0 + tpFactor);
      
      currentSlPrice = Number(sl.toFixed(5));
      currentTpPrice = Number(tp.toFixed(5));
      position = 'LONG';
    } else if (sellSignal) {
      const sl = candle.close * (1.0 + slFactor);
      const tp = candle.close * (1.0 - tpFactor);
      
      currentSlPrice = Number(sl.toFixed(5));
      currentTpPrice = Number(tp.toFixed(5));
      position = 'SHORT';
    }

    // TP/SL Exit simulation (optional for historical view)
    if (position === 'LONG' && currentSlPrice !== null) {
      if (candle.low <= currentSlPrice || candle.high >= (currentTpPrice || 0)) {
        position = null;
        currentSlPrice = null;
        currentTpPrice = null;
      }
    } else if (position === 'SHORT' && currentSlPrice !== null) {
      if (candle.high >= currentSlPrice || candle.low <= (currentTpPrice || 0)) {
        position = null;
        currentSlPrice = null;
        currentTpPrice = null;
      }
    }

    return {
      ...candle,
      superTrend: currentST,
      direction: currentDir,
      upperBand: currentST !== null && currentST > candle.close ? currentST : null,
      lowerBand: currentST !== null && currentST < candle.close ? currentST : null,
      rsi: rsiVal,
      rsiHist: rsiH,
      buySignal,
      sellSignal,
      trend: currentDir === -1 ? 'BULLISH' : 'BEARISH',
      slPrice: currentSlPrice,
      tpPrice: currentTpPrice,
      recommendedLeverage: (() => {
        if (!currentSlPrice || !candle.close) return 7;
        const diff = Math.abs(candle.close - currentSlPrice) / candle.close;
        if (diff < 0.0001) return 7;
        const suggested = Math.floor(0.20 / diff);
        return Math.max(1, Math.min(20, suggested));
      })(),
      position: position
    };
  });
}
