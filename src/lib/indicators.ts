
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
  adx: number | null;
  rsi: number | null;
  rsiHist: number | null;
  lastTouch: string | null;
  lastTouchTime: number | null;
  isStrong: boolean;
  buySignal: boolean;
  sellSignal: boolean;
  contraBuy: boolean;
  contraSell: boolean;
  trend: string;
  zigzagPivot: number | null;
  zigzagSignal: 'BUY' | 'SELL' | null;
  slPrice: number | null;
  tpPrice: number | null;
}

export function calculateSMA(data: number[], period: number): (number | null)[] {
  const sma: (number | null)[] = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) {
      sum -= data[i - period];
    }
    if (i >= period - 1) {
      sma[i] = sum / period;
    }
  }
  return sma;
}

export function calculateStdev(data: number[], period: number): (number | null)[] {
  const stdev: (number | null)[] = new Array(data.length).fill(null);
  const sma = calculateSMA(data, period);
  
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sumSq += data[i] * data[i];
    if (i >= period) {
      sumSq -= data[i - period] * data[i - period];
    }
    
    const currentSMA = sma[i];
    if (currentSMA !== null) {
      const avgSq = sumSq / period;
      const variance = avgSq - (currentSMA * currentSMA);
      stdev[i] = Math.sqrt(Math.max(0, variance));
    }
  }
  return stdev;
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

    let finalUpper = (basicUpper < prevUpper || close[i - 1] > prevUpper) ? basicUpper : prevUpper;
    let finalLower = (basicLower > prevLower || close[i - 1] < prevLower) ? basicLower : prevLower;

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
  const rsi: (number | null)[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < close.length; i++) {
    const diff = close[i] - close[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff;
      else losses -= diff;

      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      } else {
        rsi.push(null);
      }
    } else {
      const diff = close[i] - close[i - 1];
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? -diff : 0;
      
      const prevAvgGain = (gains / period); // This is simplified, real RSI uses EMA-like smoothing
      // Correct RSI smoothing:
      // avgGain = (prevAvgGain * (period - 1) + currentGain) / period
      // But we need to keep track of the rolling averages
    }
  }
  
  // Re-implementing RSI correctly with smoothing
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

export function calculateADX(high: number[], low: number[], close: number[], period: number): (number | null)[] {
  const adx: (number | null)[] = new Array(close.length).fill(null);
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [high[0] - low[0]];

  for (let i = 1; i < close.length; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  const dx: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < period) {
      smoothTR += tr[i];
      smoothPlusDM += plusDM[i];
      smoothMinusDM += minusDM[i];
      dx.push(0);
      continue;
    }

    if (i === period) {
      // Initial values
    } else {
      smoothTR = smoothTR - (smoothTR / period) + tr[i];
      smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
      smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];
    }

    const plusDI = 100 * (smoothPlusDM / smoothTR);
    const minusDI = 100 * (smoothMinusDM / smoothTR);
    const currentDX = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);
    dx.push(currentDX);

    if (i >= period * 2 - 1) {
      if (i === period * 2 - 1) {
        let dxSum = 0;
        for (let j = i - period + 1; j <= i; j++) dxSum += dx[j];
        adx[i] = dxSum / period;
      } else {
        adx[i] = (adx[i - 1]! * (period - 1) + dx[i]) / period;
      }
    }
  }

  return adx;
}

export function calculateEMA(data: number[], period: number): (number | null)[] {
  const ema: (number | null)[] = new Array(data.length).fill(null);
  const k = 2 / (period + 1);
  let prevEMA = data[0];
  ema[0] = prevEMA;
  for (let i = 1; i < data.length; i++) {
    const currentEMA = data[i] * k + prevEMA * (1 - k);
    ema[i] = currentEMA;
    prevEMA = currentEMA;
  }
  return ema;
}

export function calculateWMA(data: number[], period: number): (number | null)[] {
  const wma: (number | null)[] = new Array(data.length).fill(null);
  const weightSum = (period * (period + 1)) / 2;
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j] * (period - j);
    }
    wma[i] = sum / weightSum;
  }
  return wma;
}

export function calculateHMA(data: number[], period: number): (number | null)[] {
  const halfLen = Math.floor(period / 2);
  const sqrtLen = Math.floor(Math.sqrt(period));
  
  const wmaHalf = calculateWMA(data, halfLen);
  const wmaFull = calculateWMA(data, period);
  
  const diff: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const h = wmaHalf[i];
    const f = wmaFull[i];
    if (h !== null && f !== null) {
      diff.push(2 * h - f);
    } else {
      diff.push(0);
    }
  }
  
  return calculateWMA(diff, sqrtLen);
}

export function calculateKAMA(data: number[], period: number, fastAlphaParam: number = 3): (number | null)[] {
  const kama: (number | null)[] = new Array(data.length).fill(null);
  const fastAlpha = 2 / (fastAlphaParam + 1);
  const slowAlpha = 2 / 31;
  
  let prevKama = data[0];
  kama[0] = prevKama;
  
  for (let i = 1; i < data.length; i++) {
    if (i < period) {
      kama[i] = data[i];
      prevKama = data[i];
      continue;
    }
    
    const momentum = Math.abs(data[i] - data[i - period]);
    let volatility = 0;
    for (let j = i - period + 1; j <= i; j++) {
      volatility += Math.abs(data[j] - data[j - 1]);
    }
    
    const er = volatility !== 0 ? momentum / volatility : 0;
    const sc = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2);
    
    const currentKama = prevKama + sc * (data[i] - prevKama);
    kama[i] = currentKama;
    prevKama = currentKama;
  }
  
  return kama;
}

export function calculateJMA(data: number[], length: number, phase: number = 50, power: number = 1): (number | null)[] {
  const jma: (number | null)[] = new Array(data.length).fill(null);
  
  const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
  const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
  const alpha = Math.pow(beta, power);
  
  let e0 = 0, e1 = 0, e2 = 0, jmaValue = 0;
  let prevE0 = 0, prevE1 = 0, prevE2 = 0, prevJma = 0;

  for (let i = 0; i < data.length; i++) {
    const src = data[i];
    
    // e0 := (1 - alpha) * src + alpha * nz(e0[1])
    e0 = (1 - alpha) * src + alpha * prevE0;
    
    // e1 := (src - e0) * (1 - beta) + beta * nz(e1[1])
    e1 = (src - e0) * (1 - beta) + beta * prevE1;
    
    // e2 := (e0 + phaseRatio * e1 - nz(jma[1])) * pow(1 - alpha, 2) + pow(alpha, 2) * nz(e2[1])
    e2 = (e0 + phaseRatio * e1 - prevJma) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * prevE2;
    
    // jma := e2 + nz(jma[1])
    jmaValue = e2 + prevJma;
    
    jma[i] = jmaValue;
    
    prevE0 = e0;
    prevE1 = e1;
    prevE2 = e2;
    prevJma = jmaValue;
  }
  
  return jma;
}

export function processIndicators(candles: Candle[], settings: { 
  sensitivity: number, // ATR Length (Trend)
  multiplier: number,  // ATR Multiplier (Trend)
  useFilter: boolean,
  rsiHistLength: number,
  rsiHistMALength: number,
  rsiHistMAType: string,
  kamaAlpha?: number,
  rsiSource?: 'CLOSE' | 'HL2',
  zigzagLength?: number,
  zigzagPhase?: number,
  zigzagPower?: number,
  tpRatio?: number,
  slLookback?: number
}) {
  if (!candles || candles.length === 0) return [];

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const hl2 = candles.map(c => (c.high + c.low) / 2);
  const ohlc4 = candles.map(c => (c.open + c.high + c.low + c.close) / 4);
  
  const rsiSourceData = settings.rsiSource === 'CLOSE' ? close : hl2;

  // 1. RSI Histo Logic (Double Jurik-style Smoothing from Pine)
  const rsiRaw = calculateRSI(rsiSourceData, settings.rsiHistLength).map(v => 
    v !== null ? (v - 50) * 4 : 0
  );
  
  const rsi_ma_len = settings.rsiHistMALength;
  const beta_rsi = 0.45 * (rsi_ma_len - 1) / (0.45 * (rsi_ma_len - 1) + 2);
  
  const rsiHistMA: number[] = [];
  let tmp0_rsi = 0;
  let tmp1_rsi = 0;
  
  for (let i = 0; i < rsiRaw.length; i++) {
    const val = rsiRaw[i];
    tmp0_rsi = (1 - beta_rsi) * val + beta_rsi * tmp0_rsi;
    tmp1_rsi = (val - tmp0_rsi) * (1 - beta_rsi) + beta_rsi * tmp1_rsi;
    rsiHistMA.push(tmp0_rsi + tmp1_rsi);
  }

  // 2. Trend & Strength (Supertrend + ADX)
  const { superTrend, direction } = calculateSupertrend(high, low, close, settings.sensitivity, settings.multiplier);
  const adx = calculateADX(high, low, close, 14);

  // 3. ZigZag (Jurik) Logic
  const jma_price = calculateJMA(
    ohlc4, 
    settings.zigzagLength || 14, 
    settings.zigzagPhase || 50, 
    settings.zigzagPower || 2
  );

  const sma20 = calculateSMA(close, 20);
  const dev20 = calculateStdev(close, 20);
  const rsi = calculateRSI(close, 14);

    // 4. Volatility (ATR) for dynamic SL/TP
    const atrValues = calculateATR(high, low, close, 14);

    let prevHaOpen = (candles[0].open + candles[0].close) / 2;
    let prevHaClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;
    let lastTouchState: string | null = null;
    let lastTouchTime: number | null = null;

    let currentSlPrice: number | null = null;
    let currentTpPrice: number | null = null;
    let position: 'LONG' | 'SHORT' | null = null;

    return candles.map((candle, i) => {
        // Heikin Ashi Calculation
        let haOpen: number, haClose: number, haHigh: number, haLow: number;
        if (i === 0) {
            haOpen = (candle.open + candle.close) / 2;
            haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
        } else {
            haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
            haOpen = (prevHaOpen + prevHaClose) / 2;
        }
        haHigh = Math.max(candle.high, haOpen, haClose);
        haLow = Math.min(candle.low, haOpen, haClose);

        prevHaOpen = haOpen;
        prevHaClose = haClose;

        const st = superTrend[i];
        const dir = direction[i];
        const basis = sma20[i];
        const dev = dev20[i];
        const upperZone = basis !== null && dev !== null ? basis + 2 * dev : null;
        const lowerZone = basis !== null && dev !== null ? basis - 2 * dev : null;
        const currentRSI = rsi[i];
        const currentADX = adx[i];
        const rsiHistValue = rsiHistMA[i];
        const currentATR = atrValues[i] || 0;

        let zigzagSignal: 'BUY' | 'SELL' | null = null;
        let zigzagPivot: number | null = null;
        
        if (i > 1) {
            const p = jma_price[i];
            const p1 = jma_price[i - 1];
            const p2 = jma_price[i - 2];
            
            if (p !== null && p1 !== null && p2 !== null) {
                const wasFalling = p1 < p2;
                const isNotFalling = p >= p1;
                const zigzagUp = wasFalling && isNotFalling;

                const wasRising = p1 > p2;
                const isNotRising = p <= p1;
                const zigzagDown = wasRising && isNotRising;

                if (zigzagUp) {
                    zigzagSignal = 'BUY';
                    zigzagPivot = Math.min(...low.slice(Math.max(0, i-2), i+1));
                } else if (zigzagDown) {
                    zigzagSignal = 'SELL';
                    zigzagPivot = Math.max(...high.slice(Math.max(0, i-2), i+1));
                }
            }
        }

        const isStrong = currentADX !== null && currentADX > 25;
        const isBullishTrend = dir === -1;
        const isBearishTrend = dir === 1;
        
        // TP/SL Logic with ATR buffer
        const slLookback = settings.slLookback || 3;
        const tpRatio = settings.tpRatio || 2.0;
        const minProfitPct = 0.003; 

        let buySignal = zigzagSignal === 'BUY' && isBullishTrend && rsiHistValue > 0 && isStrong;
        let sellSignal = zigzagSignal === 'SELL' && isBearishTrend && rsiHistValue < 0 && isStrong;

        if (buySignal && position !== 'LONG') {
            const lookbackLow = Math.min(...low.slice(Math.max(0, i - slLookback + 1), i + 1));
            const sl = lookbackLow - (currentATR * 0.5);
            const risk = candle.close - sl;
            const tp = candle.close + (risk * tpRatio);
            
            const profitPotential = (tp - candle.close) / candle.close;
            if (profitPotential < minProfitPct) {
                buySignal = false;
            } else {
                position = 'LONG';
                currentSlPrice = sl;
                currentTpPrice = tp;
            }
        } else if (sellSignal && position !== 'SHORT') {
            const lookbackHigh = Math.max(...high.slice(Math.max(0, i - slLookback + 1), i + 1));
            const sl = lookbackHigh + (currentATR * 0.5);
            const risk = sl - candle.close;
            const tp = candle.close - (risk * tpRatio);
            
            const profitPotential = (candle.close - tp) / candle.close;
            if (profitPotential < minProfitPct) {
                sellSignal = false;
            } else {
                position = 'SHORT';
                currentSlPrice = sl;
                currentTpPrice = tp;
            }
        }

    // Check Exits
    if (position === 'LONG') {
      if (candle.low <= (currentSlPrice || 0) || candle.high >= (currentTpPrice || 0)) {
        position = null;
      }
    } else if (position === 'SHORT') {
      if (candle.high >= (currentSlPrice || 0) || candle.low <= (currentTpPrice || 0)) {
        position = null;
      }
    }

    // Track Last Touched Band
    if (upperZone !== null && candle.high >= upperZone) {
      lastTouchState = 'UPPER';
      lastTouchTime = candle.time;
    } else if (lowerZone !== null && candle.low <= lowerZone) {
      lastTouchState = 'LOWER';
      lastTouchTime = candle.time;
    }

    const contraBuy = lowerZone !== null && currentRSI !== null && candle.low <= lowerZone && currentRSI < 30;
    const contraSell = upperZone !== null && currentRSI !== null && candle.high >= upperZone && currentRSI > 70;

    return {
      ...candle,
      haOpen: Number(haOpen.toFixed(8)),
      haHigh: Number(haHigh.toFixed(8)),
      haLow: Number(haLow.toFixed(8)),
      haClose: Number(haClose.toFixed(8)),
      superTrend: st,
      direction: dir,
      upperBand: upperZone,
      lowerBand: lowerZone,
      adx: currentADX,
      rsi: currentRSI,
      rsiHist: rsiHistValue,
      lastTouch: lastTouchState,
      lastTouchTime: lastTouchTime,
      isStrong,
      buySignal,
      sellSignal,
      contraBuy,
      contraSell,
      trend: dir === -1 ? 'BULLISH' : 'BEARISH',
      zigzagPivot,
      zigzagSignal,
      slPrice: currentSlPrice,
      tpPrice: currentTpPrice,
      position: position
    };
  });
}
