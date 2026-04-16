
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
}

export function calculateSMA(data: number[], period: number): (number | null)[] {
  const sma: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

export function calculateStdev(data: number[], period: number): (number | null)[] {
  const stdev: (number | null)[] = [];
  const sma = calculateSMA(data, period);
  for (let i = 0; i < data.length; i++) {
    const currentSMA = sma[i];
    if (currentSMA === null) {
      stdev.push(null);
      continue;
    }
    const variance = data.slice(i - period + 1, i + 1).reduce((a, b) => a + Math.pow(b - currentSMA, 2), 0) / period;
    stdev.push(Math.sqrt(variance));
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

export function calculateJMA(data: number[], length: number): (number | null)[] {
  const jma: (number | null)[] = new Array(data.length).fill(null);
  const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
  const alpha = beta;
  
  let tmp0 = 0, tmp1 = 0, tmp2 = 0, tmp3 = 0, tmp4 = 0;
  let prevTmp0 = 0, prevTmp1 = 0, prevTmp3 = 0, prevTmp4 = 0;

  for (let i = 0; i < data.length; i++) {
    const src = data[i];
    tmp0 = (1 - alpha) * src + alpha * prevTmp0;
    tmp1 = (src - tmp0) * (1 - beta) + beta * prevTmp1;
    tmp2 = tmp0 + tmp1;
    tmp3 = (tmp2 - prevTmp4) * ((1 - alpha) * (1 - alpha)) + (alpha * alpha) * prevTmp3;
    tmp4 = prevTmp4 + tmp3;
    
    jma[i] = tmp4;
    
    prevTmp0 = tmp0;
    prevTmp1 = tmp1;
    prevTmp3 = tmp3;
    prevTmp4 = tmp4;
  }
  
  return jma;
}

export function processIndicators(candles: Candle[], settings: { 
  sensitivity: number, 
  multiplier: number, 
  useFilter: boolean,
  rsiHistLength: number,
  rsiHistMALength: number,
  rsiHistMAType: string,
  kamaAlpha?: number,
  rsiSource?: 'CLOSE' | 'HL2'
}) {
  if (!candles || candles.length === 0) return [];

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const hl2 = candles.map(c => (c.high + c.low) / 2);
  
  const rsiSourceData = settings.rsiSource === 'CLOSE' ? close : hl2;

  const { superTrend, direction } = calculateSupertrend(high, low, close, settings.sensitivity, settings.multiplier);
  const sma20 = calculateSMA(close, 20);
  const dev20 = calculateStdev(close, 20);
  const rsi = calculateRSI(close, 14);
  const adx = calculateADX(high, low, close, 14);

  // RSI Histogram Calculation
  const rsiHistRaw = calculateRSI(rsiSourceData, settings.rsiHistLength).map(v => v !== null ? Math.min(100, Math.max(-100, (v - 50) * 4)) : 0);
  
  let rsiHistMA: (number | null)[] = [];
  switch (settings.rsiHistMAType) {
    case 'SMA': rsiHistMA = calculateSMA(rsiHistRaw, settings.rsiHistMALength); break;
    case 'EMA': rsiHistMA = calculateEMA(rsiHistRaw, settings.rsiHistMALength); break;
    case 'WMA': rsiHistMA = calculateWMA(rsiHistRaw, settings.rsiHistMALength); break;
    case 'HMA': rsiHistMA = calculateHMA(rsiHistRaw, settings.rsiHistMALength); break;
    case 'JMA': rsiHistMA = calculateJMA(rsiHistRaw, settings.rsiHistMALength); break;
    case 'KAMA': rsiHistMA = calculateKAMA(rsiHistRaw, settings.rsiHistMALength, settings.kamaAlpha || 3); break;
    default: rsiHistMA = rsiHistRaw;
  }

  let prevHaOpen = (candles[0].open + candles[0].close) / 2;
  let prevHaClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;
  let lastTouchState: string | null = null;
  let lastTouchTime: number | null = null;

  return candles.map((candle, i) => {
    // Heikin Ashi Calculation
    let haOpen: number, haClose: number, haHigh: number, haLow: number;
    if (i === 0) {
      haOpen = prevHaOpen;
      haClose = prevHaClose;
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

    const isStrong = currentADX !== null && currentADX > 25;
    
    // Track Last Touched Band
    if (upperZone !== null && candle.high >= upperZone) {
      lastTouchState = 'UPPER';
      lastTouchTime = candle.time;
    } else if (lowerZone !== null && candle.low <= lowerZone) {
      lastTouchState = 'LOWER';
      lastTouchTime = candle.time;
    }

    // Signal Logic
    const prevST = superTrend[i - 1];
    const prevClose = candles[i - 1]?.close;
    
    const signalBuy = st !== null && prevST !== null && prevClose !== null && prevClose <= prevST && candle.close > st;
    const signalSell = st !== null && prevST !== null && prevClose !== null && prevClose >= prevST && candle.close < st;

    const contraBuy = lowerZone !== null && currentRSI !== null && candle.low <= lowerZone && currentRSI < 30;
    const contraSell = upperZone !== null && currentRSI !== null && candle.high >= upperZone && currentRSI > 70;

    const validBuy = settings.useFilter ? (signalBuy && currentADX !== null && currentADX > 20) : signalBuy;
    const validSell = settings.useFilter ? (signalSell && currentADX !== null && currentADX > 20) : signalSell;

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
      buySignal: validBuy,
      sellSignal: validSell,
      contraBuy,
      contraSell,
      trend: dir === -1 ? 'BULLISH' : 'BEARISH'
    };
  });
}
