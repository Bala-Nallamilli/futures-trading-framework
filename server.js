/**
 * Trading Decision Framework - Backend Server
 *
 * Multi-Exchange Price Aggregation: Binance + Coinbase + Kraken
 * Performs pattern recognition and broadcasts decisions to clients
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const https = require('https');
const Redis = require('ioredis');

const app = express();

// =============================================================================
// REDIS CONFIGURATION
// =============================================================================
// Set USE_REDIS=true in environment or modify this to enable Redis caching
const USE_REDIS = process.env.USE_REDIS === 'true' || false;

let redis = null;
let redisConnected = false;

if (USE_REDIS) {
  // Redis client for caching
  redis = new Redis({
    host: 'localhost',
    port: 6379,
    retryStrategy: (times) => {
      if (times > 3) {
        console.log('⚠️ Redis unavailable - running without cache');
        return null; // Stop retrying
      }
      return Math.min(times * 200, 1000);
    }
  });

  redis.on('connect', () => {
    console.log('✅ Redis connected - caching enabled');
    redisConnected = true;
  });

  redis.on('error', (err) => {
    if (redisConnected) {
      console.log('⚠️ Redis error:', err.message);
    }
    redisConnected = false;
  });
} else {
  console.log('ℹ️ Redis caching disabled - running in direct mode');
}

// Cache configuration
const CACHE_TTL = 300; // 5 minutes TTL for candle data
const CACHE_PREFIX = 'trading:';

// =============================================================================
// REDIS CACHE HELPERS
// =============================================================================

async function getCachedCandles(instrument, timeframe) {
  if (!USE_REDIS || !redisConnected) return null;

  try {
    const key = `${CACHE_PREFIX}candles:${instrument}:${timeframe}`;
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Redis get error:', err.message);
  }
  return null;
}

async function setCachedCandles(instrument, timeframe, candles) {
  if (!USE_REDIS || !redisConnected) return;

  try {
    const key = `${CACHE_PREFIX}candles:${instrument}:${timeframe}`;
    await redis.setex(key, CACHE_TTL, JSON.stringify(candles));
  } catch (err) {
    console.error('Redis set error:', err.message);
  }
}

async function loadAllFromCache() {
  if (!USE_REDIS || !redisConnected) {
    if (USE_REDIS) {
      console.log('⚠️ Redis not connected - skipping cache load');
    }
    return false;
  }

  console.log('📦 Loading data from Redis cache...');
  let loadedCount = 0;

  for (const instrument of CONFIG.INSTRUMENTS) {
    const displayName = CONFIG.INSTRUMENT_DISPLAY[instrument];

    for (const tf of CONFIG.TIMEFRAMES) {
      const cached = await getCachedCandles(instrument, tf);
      if (cached && cached.length > 0) {
        const key = `${displayName}_${tf}`;
        dataStore.candles[key] = cached;

        // Recalculate patterns for cached data
        if (cached.length >= 3) {
          const latestCandle = cached[cached.length - 1];
          const patterns = PatternRecognizer.analyzeCandle(latestCandle, cached.length - 1, cached);
          dataStore.patterns[key] = patterns;
          dataStore.decisions[key] = PatternRecognizer.generateDecision(patterns, latestCandle, cached);
        }
        // Calculate technical indicators
        if (cached.length >= 30) {
          dataStore.indicators[key] = TechnicalIndicators.calculateAll(cached);
        }
        loadedCount++;
      }
    }
  }

  if (loadedCount > 0) {
    console.log(`✅ Loaded ${loadedCount} cached datasets from Redis`);
    return true;
  }

  console.log('📭 No cached data found in Redis');
  return false;
}

app.use(cors());
app.use(express.json());
app.use(express.static('client/dist'));

const server = http.createServer(app);

// WebSocket server for clients
const wss = new WebSocket.Server({ server });

// Configuration
const CONFIG = {
  // Top 10 crypto trading pairs
  INSTRUMENTS: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
    'SOLUSDT', 'DOGEUSDT', 'DOTUSDT', 'POLUSDT', 'LTCUSDT','SUIUSDT'
  ],
  // Display names mapping (POL was formerly MATIC - rebranded Sept 2024)
  INSTRUMENT_DISPLAY: {
    'BTCUSDT': 'BTC_USDT',
    'ETHUSDT': 'ETH_USDT',
    'BNBUSDT': 'BNB_USDT',
    'XRPUSDT': 'XRP_USDT',
    'ADAUSDT': 'ADA_USDT',
    'SOLUSDT': 'SOL_USDT',
    'DOGEUSDT': 'DOGE_USDT',
    'DOTUSDT': 'DOT_USDT',
    'POLUSDT': 'POL_USDT',
    'LTCUSDT': 'LTC_USDT',
    'SUIUSDT': 'SUI_USDT'
  },
  // Symbol mappings for each exchange
  COINBASE_SYMBOLS: {
    'BTC_USDT': 'BTC-USD',
    'ETH_USDT': 'ETH-USD',
    'SOL_USDT': 'SOL-USD',
    'DOGE_USDT': 'DOGE-USD',
    'DOT_USDT': 'DOT-USD',
    'POL_USDT': 'POL-USD',
    'LTC_USDT': 'LTC-USD',
    'XRP_USDT': 'XRP-USD',
    'ADA_USDT': 'ADA-USD',
    'SUI_USDT': 'SUI-USD'
    // Note: BNB not available on Coinbase
  },
  KRAKEN_SYMBOLS: {
    'BTC_USDT': 'XBT/USD',
    'ETH_USDT': 'ETH/USD',
    'SOL_USDT': 'SOL/USD',
    'DOGE_USDT': 'DOGE/USD',
    'DOT_USDT': 'DOT/USD',
    'POL_USDT': 'POL/USD',
    'LTC_USDT': 'LTC/USD',
    'XRP_USDT': 'XRP/USD',
    'ADA_USDT': 'ADA/USD',
    'SUI_USDT': 'SUI/USD'
    // Note: BNB not available on Kraken
  },
  TIMEFRAMES: ['1m', '5m', '15m', '1h', '4h'],
  RECONNECT_DELAY: 5000,
  MAX_RECONNECT_ATTEMPTS: 10,
};

// Store for candle data, patterns, and multi-exchange prices
const dataStore = {
  candles: {},
  patterns: {},
  decisions: {},
  indicators: {},  // Technical indicators per instrument/timeframe
  tickers: {},
  // Per-exchange prices for aggregation
  exchangePrices: {
    binance: {},
    coinbase: {},
    kraken: {}
  }
};

// Initialize data store
CONFIG.INSTRUMENTS.forEach(instrument => {
  const displayName = CONFIG.INSTRUMENT_DISPLAY[instrument];
  CONFIG.TIMEFRAMES.forEach(tf => {
    const key = `${displayName}_${tf}`;
    dataStore.candles[key] = [];
    dataStore.patterns[key] = [];
    dataStore.decisions[key] = null;
    dataStore.indicators[key] = null;
  });
  dataStore.tickers[displayName] = {
    price: 0,
    binancePrice: 0,
    coinbasePrice: 0,
    krakenPrice: 0,
    change: 0,
    high24h: 0,
    low24h: 0,
    volume: 0,
    sources: []
  };
  dataStore.exchangePrices.binance[displayName] = 0;
  dataStore.exchangePrices.coinbase[displayName] = 0;
  dataStore.exchangePrices.kraken[displayName] = 0;
});

// =============================================================================
// PRICE AGGREGATION
// =============================================================================

function calculateAggregatedPrice(displayName) {
  const binancePrice = dataStore.exchangePrices.binance[displayName] || 0;
  const coinbasePrice = dataStore.exchangePrices.coinbase[displayName] || 0;
  const krakenPrice = dataStore.exchangePrices.kraken[displayName] || 0;

  const prices = [];
  const sources = [];

  if (binancePrice > 0) {
    prices.push(binancePrice);
    sources.push('Binance');
  }
  if (coinbasePrice > 0) {
    prices.push(coinbasePrice);
    sources.push('Coinbase');
  }
  if (krakenPrice > 0) {
    prices.push(krakenPrice);
    sources.push('Kraken');
  }

  if (prices.length === 0) return { price: 0, sources: [] };

  // Calculate weighted average (equal weights for now)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  return {
    price: parseFloat(avgPrice.toFixed(8)),
    sources,
    binancePrice,
    coinbasePrice,
    krakenPrice
  };
}

function updateAggregatedTicker(displayName) {
  const aggregated = calculateAggregatedPrice(displayName);
  const ticker = dataStore.tickers[displayName];

  if (aggregated.price > 0) {
    ticker.price = aggregated.price;
    ticker.binancePrice = aggregated.binancePrice;
    ticker.coinbasePrice = aggregated.coinbasePrice;
    ticker.krakenPrice = aggregated.krakenPrice;
    ticker.sources = aggregated.sources;

    broadcastToClients('ticker', {
      instrument: displayName,
      ...ticker
    });
  }
}

// =============================================================================
// TECHNICAL INDICATORS ENGINE
// =============================================================================

class TechnicalIndicators {
  // ===========================================================================
  // MOVING AVERAGES
  // ===========================================================================

  // Simple Moving Average
  static SMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  // Exponential Moving Average
  static EMA(data, period) {
    if (data.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = this.SMA(data.slice(0, period), period);

    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  // Calculate EMA array for all data points
  static EMAArray(data, period) {
    if (data.length < period) return [];

    const multiplier = 2 / (period + 1);
    const emaArray = [];

    // First EMA is SMA
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    emaArray.push(ema);

    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
      emaArray.push(ema);
    }
    return emaArray;
  }

  // ===========================================================================
  // RSI - Relative Strength Index
  // ===========================================================================
  static RSI(closes, period = 14) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Smooth using Wilder's method
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // ===========================================================================
  // MACD - Moving Average Convergence Divergence
  // ===========================================================================
  static MACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (closes.length < slowPeriod + signalPeriod) return null;

    const fastEMA = this.EMAArray(closes, fastPeriod);
    const slowEMA = this.EMAArray(closes, slowPeriod);

    // MACD Line = Fast EMA - Slow EMA
    const macdLine = [];
    const startIndex = slowPeriod - fastPeriod;

    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + startIndex] - slowEMA[i]);
    }

    // Signal Line = 9-period EMA of MACD Line
    const signalLine = this.EMAArray(macdLine, signalPeriod);

    const macd = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const histogram = macd - signal;

    // Determine signal
    let trend = 'neutral';
    if (macd > signal && macd > 0) trend = 'bullish';
    else if (macd < signal && macd < 0) trend = 'bearish';
    else if (macd > signal) trend = 'bullish_crossover';
    else if (macd < signal) trend = 'bearish_crossover';

    return {
      macd: parseFloat(macd.toFixed(4)),
      signal: parseFloat(signal.toFixed(4)),
      histogram: parseFloat(histogram.toFixed(4)),
      trend
    };
  }

  // ===========================================================================
  // STOCHASTIC OSCILLATOR
  // ===========================================================================
  static Stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    if (closes.length < kPeriod + dPeriod) return null;

    const kValues = [];

    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);

      const highestHigh = Math.max(...highSlice);
      const lowestLow = Math.min(...lowSlice);

      const k = highestHigh === lowestLow ? 50 :
        ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      kValues.push(k);
    }

    // %D is SMA of %K
    const dValue = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
    const kValue = kValues[kValues.length - 1];

    let signal = 'neutral';
    if (kValue > 80 && kValue < dValue) signal = 'overbought_reversal';
    else if (kValue < 20 && kValue > dValue) signal = 'oversold_reversal';
    else if (kValue > 80) signal = 'overbought';
    else if (kValue < 20) signal = 'oversold';
    else if (kValue > dValue) signal = 'bullish';
    else signal = 'bearish';

    return {
      k: parseFloat(kValue.toFixed(2)),
      d: parseFloat(dValue.toFixed(2)),
      signal
    };
  }

  // ===========================================================================
  // ADX - Average Directional Index (Trend Strength)
  // ===========================================================================
  static ADX(highs, lows, closes, period = 14) {
    if (closes.length < period * 2) return null;

    const trueRanges = [];
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < closes.length; i++) {
      // True Range
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);

      // Directional Movement
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smooth with Wilder's method
    const smoothTR = this.wilderSmooth(trueRanges, period);
    const smoothPlusDM = this.wilderSmooth(plusDM, period);
    const smoothMinusDM = this.wilderSmooth(minusDM, period);

    // Calculate +DI and -DI
    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;

    // Calculate DX
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    // ADX is smoothed DX (simplified - using recent DX)
    const adx = dx;

    let trend = 'weak';
    if (adx > 50) trend = 'very_strong';
    else if (adx > 25) trend = 'strong';
    else if (adx > 20) trend = 'moderate';

    let direction = 'neutral';
    if (plusDI > minusDI) direction = 'bullish';
    else if (minusDI > plusDI) direction = 'bearish';

    return {
      adx: parseFloat(adx.toFixed(2)),
      plusDI: parseFloat(plusDI.toFixed(2)),
      minusDI: parseFloat(minusDI.toFixed(2)),
      trend,
      direction
    };
  }

  // Wilder's smoothing method
  static wilderSmooth(data, period) {
    if (data.length < period) return 0;

    let sum = data.slice(0, period).reduce((a, b) => a + b, 0);

    for (let i = period; i < data.length; i++) {
      sum = sum - (sum / period) + data[i];
    }
    return sum;
  }

  // ===========================================================================
  // BOLLINGER BANDS
  // ===========================================================================
  static BollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return null;

    const sma = this.SMA(closes, period);
    const slice = closes.slice(-period);

    // Calculate standard deviation
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(variance);

    const upper = sma + (sd * stdDev);
    const lower = sma - (sd * stdDev);
    const currentPrice = closes[closes.length - 1];

    // Calculate %B (where price is relative to bands)
    const percentB = (currentPrice - lower) / (upper - lower);

    // Bandwidth (volatility measure)
    const bandwidth = ((upper - lower) / sma) * 100;

    let signal = 'neutral';
    if (percentB > 1) signal = 'overbought';
    else if (percentB < 0) signal = 'oversold';
    else if (percentB > 0.8) signal = 'upper_zone';
    else if (percentB < 0.2) signal = 'lower_zone';

    return {
      upper: parseFloat(upper.toFixed(2)),
      middle: parseFloat(sma.toFixed(2)),
      lower: parseFloat(lower.toFixed(2)),
      percentB: parseFloat(percentB.toFixed(3)),
      bandwidth: parseFloat(bandwidth.toFixed(2)),
      signal
    };
  }

  // ===========================================================================
  // OBV - On-Balance Volume
  // ===========================================================================
  static OBV(closes, volumes) {
    if (closes.length < 2) return null;

    let obv = 0;
    const obvArray = [0];

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
      obvArray.push(obv);
    }

    // Calculate OBV trend using simple linear regression
    const recentOBV = obvArray.slice(-10);
    const slope = this.calculateOBVSlope(recentOBV);

    let trend = 'neutral';
    if (slope > 0.1) trend = 'accumulation';
    else if (slope < -0.1) trend = 'distribution';

    return {
      obv: Math.round(obv),
      trend,
      slope: parseFloat(slope.toFixed(4))
    };
  }

  static calculateOBVSlope(values) {
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    // Normalize values to prevent huge numbers
    const maxVal = Math.max(...values.map(Math.abs)) || 1;
    const normalizedValues = values.map(v => v / maxVal);

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += normalizedValues[i];
      sumXY += i * normalizedValues[i];
      sumX2 += i * i;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  // ===========================================================================
  // VOLUME PROFILE (Simplified - Volume by price zones)
  // ===========================================================================
  static VolumeProfile(candles, zones = 10) {
    if (candles.length < 10) return null;

    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));
    const volumes = candles.map(c => parseFloat(c.v));
    const closes = candles.map(c => parseFloat(c.c));

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow;
    const zoneSize = range / zones;

    // Initialize volume zones
    const volumeZones = Array(zones).fill(0);

    // Distribute volume across price zones
    for (let i = 0; i < candles.length; i++) {
      const avgPrice = (highs[i] + lows[i]) / 2;
      const zoneIndex = Math.min(zones - 1, Math.floor((avgPrice - minLow) / zoneSize));
      volumeZones[zoneIndex] += volumes[i];
    }

    // Find POC (Point of Control) - highest volume zone
    const maxVolume = Math.max(...volumeZones);
    const pocIndex = volumeZones.indexOf(maxVolume);
    const pocPrice = minLow + (pocIndex + 0.5) * zoneSize;

    // Value Area (70% of volume)
    const totalVolume = volumeZones.reduce((a, b) => a + b, 0);
    const targetVolume = totalVolume * 0.7;

    let vaVolume = volumeZones[pocIndex];
    let vaHigh = pocIndex;
    let vaLow = pocIndex;

    while (vaVolume < targetVolume && (vaHigh < zones - 1 || vaLow > 0)) {
      const highVol = vaHigh < zones - 1 ? volumeZones[vaHigh + 1] : 0;
      const lowVol = vaLow > 0 ? volumeZones[vaLow - 1] : 0;

      if (highVol >= lowVol && vaHigh < zones - 1) {
        vaHigh++;
        vaVolume += highVol;
      } else if (vaLow > 0) {
        vaLow--;
        vaVolume += lowVol;
      }
    }

    const currentPrice = closes[closes.length - 1];
    let position = 'neutral';
    if (currentPrice > minLow + (vaHigh + 1) * zoneSize) position = 'above_value_area';
    else if (currentPrice < minLow + vaLow * zoneSize) position = 'below_value_area';
    else position = 'in_value_area';

    return {
      poc: parseFloat(pocPrice.toFixed(2)),
      valueAreaHigh: parseFloat((minLow + (vaHigh + 1) * zoneSize).toFixed(2)),
      valueAreaLow: parseFloat((minLow + vaLow * zoneSize).toFixed(2)),
      position,
      volumeZones: volumeZones.map(v => Math.round(v))
    };
  }

  // ===========================================================================
  // ATR - Average True Range (Volatility)
  // ===========================================================================
  static ATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return null;

    const trueRanges = [];

    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    // Use Wilder's smoothing
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }

    const currentPrice = closes[closes.length - 1];
    const atrPercent = (atr / currentPrice) * 100;

    let volatility = 'low';
    if (atrPercent > 5) volatility = 'very_high';
    else if (atrPercent > 3) volatility = 'high';
    else if (atrPercent > 1.5) volatility = 'moderate';

    return {
      atr: parseFloat(atr.toFixed(4)),
      atrPercent: parseFloat(atrPercent.toFixed(2)),
      volatility
    };
  }

  // ===========================================================================
  // ELLIOTT WAVE DETECTION (Simplified)
  // Identifies potential wave patterns: Impulse (5-wave) and Corrective (3-wave)
  // ===========================================================================
  static detectElliottWave(candles) {
    if (candles.length < 30) return null;

    const closes = candles.map(c => parseFloat(c.c));
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));

    // Find significant pivots (swing highs and lows)
    const pivots = this.findPivots(highs, lows, closes, 5);

    if (pivots.length < 5) return null;

    // Try to identify impulse wave (5-wave pattern)
    const impulseWave = this.identifyImpulseWave(pivots, closes);
    if (impulseWave) return impulseWave;

    // Try to identify corrective wave (ABC pattern)
    const correctiveWave = this.identifyCorrectiveWave(pivots, closes);
    if (correctiveWave) return correctiveWave;

    return {
      pattern: 'indeterminate',
      description: 'No clear wave pattern detected',
      confidence: 'low'
    };
  }

  static findPivots(highs, lows, closes, strength = 5) {
    const pivots = [];

    for (let i = strength; i < closes.length - strength; i++) {
      // Check for swing high
      const isSwingHigh = highs.slice(i - strength, i).every(h => highs[i] > h) &&
                          highs.slice(i + 1, i + strength + 1).every(h => highs[i] > h);

      // Check for swing low
      const isSwingLow = lows.slice(i - strength, i).every(l => lows[i] < l) &&
                         lows.slice(i + 1, i + strength + 1).every(l => lows[i] < l);

      if (isSwingHigh) {
        pivots.push({ index: i, type: 'high', value: highs[i] });
      } else if (isSwingLow) {
        pivots.push({ index: i, type: 'low', value: lows[i] });
      }
    }

    return pivots;
  }

  static identifyImpulseWave(pivots, closes) {
    // Look for 5-wave impulse pattern in the last pivots
    const recentPivots = pivots.slice(-6);
    if (recentPivots.length < 5) return null;

    // Bullish impulse: low-high-low-high-low-high (5 waves up)
    // Wave 1: low to high, Wave 2: high to low (< Wave 1 start)
    // Wave 3: low to high (> Wave 1 high), Wave 4: high to low (> Wave 1 low)
    // Wave 5: low to high (may or may not exceed Wave 3)

    for (let i = 0; i <= recentPivots.length - 5; i++) {
      const p0 = recentPivots[i];
      const p1 = recentPivots[i + 1];
      const p2 = recentPivots[i + 2];
      const p3 = recentPivots[i + 3];
      const p4 = recentPivots[i + 4];

      // Check for bullish impulse
      if (p0.type === 'low' && p1.type === 'high' && p2.type === 'low' &&
          p3.type === 'high' && p4.type === 'low') {

        // Wave 2 cannot retrace more than 100% of Wave 1
        if (p2.value > p0.value) {
          // Wave 3 must exceed Wave 1 high
          if (p3.value > p1.value) {
            // Wave 4 cannot overlap Wave 1 territory
            if (p4.value > p1.value) {
              const currentPrice = closes[closes.length - 1];
              const wave5Progress = (currentPrice - p4.value) / (p3.value - p4.value);

              return {
                pattern: 'bullish_impulse',
                wave: wave5Progress > 0 ? 'Wave 5 in progress' : 'Wave 5 starting',
                points: {
                  wave1: { start: p0.value, end: p1.value },
                  wave2: { start: p1.value, end: p2.value },
                  wave3: { start: p2.value, end: p3.value },
                  wave4: { start: p3.value, end: p4.value }
                },
                projection: p4.value + (p3.value - p2.value), // Wave 5 = Wave 3 (common)
                confidence: 'medium',
                description: 'Bullish 5-wave impulse detected - Wave 5 may target ' +
                             (p4.value + (p3.value - p2.value)).toFixed(2)
              };
            }
          }
        }
      }

      // Check for bearish impulse
      if (p0.type === 'high' && p1.type === 'low' && p2.type === 'high' &&
          p3.type === 'low' && p4.type === 'high') {

        if (p2.value < p0.value && p3.value < p1.value && p4.value < p1.value) {
          const currentPrice = closes[closes.length - 1];
          const wave5Progress = (p4.value - currentPrice) / (p4.value - p3.value);

          return {
            pattern: 'bearish_impulse',
            wave: wave5Progress > 0 ? 'Wave 5 in progress' : 'Wave 5 starting',
            points: {
              wave1: { start: p0.value, end: p1.value },
              wave2: { start: p1.value, end: p2.value },
              wave3: { start: p2.value, end: p3.value },
              wave4: { start: p3.value, end: p4.value }
            },
            projection: p4.value - (p2.value - p3.value),
            confidence: 'medium',
            description: 'Bearish 5-wave impulse detected - Wave 5 may target ' +
                         (p4.value - (p2.value - p3.value)).toFixed(2)
          };
        }
      }
    }

    return null;
  }

  static identifyCorrectiveWave(pivots, closes) {
    // Look for ABC correction pattern
    const recentPivots = pivots.slice(-4);
    if (recentPivots.length < 3) return null;

    for (let i = 0; i <= recentPivots.length - 3; i++) {
      const a = recentPivots[i];
      const b = recentPivots[i + 1];
      const c = recentPivots[i + 2];

      // Bullish ABC correction (downward correction in uptrend)
      if (a.type === 'high' && b.type === 'low' && c.type === 'high') {
        // B wave should not exceed A
        if (c.value < a.value && c.value > b.value) {
          const currentPrice = closes[closes.length - 1];

          return {
            pattern: 'bullish_abc_correction',
            wave: currentPrice < c.value ? 'C wave in progress' : 'Correction complete',
            points: {
              waveA: { start: a.value, end: b.value },
              waveB: { start: b.value, end: c.value }
            },
            projection: c.value - (a.value - b.value), // C often equals A
            confidence: 'medium',
            description: 'ABC correction in uptrend - May resume bullish after ' +
                         (c.value - (a.value - b.value)).toFixed(2)
          };
        }
      }

      // Bearish ABC correction (upward correction in downtrend)
      if (a.type === 'low' && b.type === 'high' && c.type === 'low') {
        if (c.value > a.value && c.value < b.value) {
          const currentPrice = closes[closes.length - 1];

          return {
            pattern: 'bearish_abc_correction',
            wave: currentPrice > c.value ? 'C wave in progress' : 'Correction complete',
            points: {
              waveA: { start: a.value, end: b.value },
              waveB: { start: b.value, end: c.value }
            },
            projection: c.value + (b.value - a.value),
            confidence: 'medium',
            description: 'ABC correction in downtrend - May resume bearish after ' +
                         (c.value + (b.value - a.value)).toFixed(2)
          };
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // CALCULATE ALL INDICATORS FOR A CANDLE SET
  // ===========================================================================
  static calculateAll(candles) {
    if (!candles || candles.length < 30) {
      return null;
    }

    const closes = candles.map(c => parseFloat(c.c));
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));
    const volumes = candles.map(c => parseFloat(c.v));

    return {
      // Momentum
      rsi: this.RSI(closes, 14),
      macd: this.MACD(closes),
      stochastic: this.Stochastic(highs, lows, closes),

      // Trend
      ema20: this.EMA(closes, 20),
      ema50: this.EMA(closes, 50),
      sma20: this.SMA(closes, 20),
      adx: this.ADX(highs, lows, closes),

      // Volatility
      bollingerBands: this.BollingerBands(closes),
      atr: this.ATR(highs, lows, closes),

      // Volume
      obv: this.OBV(closes, volumes),
      volumeProfile: this.VolumeProfile(candles),

      // Elliott Wave
      elliottWave: this.detectElliottWave(candles),

      // Summary
      summary: this.generateSummary(closes, highs, lows)
    };
  }

  static generateSummary(closes, highs, lows) {
    const rsi = this.RSI(closes, 14);
    const macd = this.MACD(closes);
    const stoch = this.Stochastic(highs, lows, closes);
    const adx = this.ADX(highs, lows, closes);
    const bb = this.BollingerBands(closes);

    let bullishSignals = 0;
    let bearishSignals = 0;

    // RSI signals
    if (rsi < 30) bullishSignals++;
    else if (rsi > 70) bearishSignals++;

    // MACD signals
    if (macd?.trend === 'bullish' || macd?.trend === 'bullish_crossover') bullishSignals++;
    else if (macd?.trend === 'bearish' || macd?.trend === 'bearish_crossover') bearishSignals++;

    // Stochastic signals
    if (stoch?.signal === 'oversold_reversal') bullishSignals++;
    else if (stoch?.signal === 'overbought_reversal') bearishSignals++;

    // ADX trend direction
    if (adx?.direction === 'bullish' && adx?.trend !== 'weak') bullishSignals++;
    else if (adx?.direction === 'bearish' && adx?.trend !== 'weak') bearishSignals++;

    // Bollinger Bands
    if (bb?.signal === 'oversold') bullishSignals++;
    else if (bb?.signal === 'overbought') bearishSignals++;

    // EMA crossover
    const ema20 = this.EMA(closes, 20);
    const ema50 = this.EMA(closes, 50);
    if (ema20 > ema50) bullishSignals++;
    else if (ema20 < ema50) bearishSignals++;

    const total = bullishSignals + bearishSignals;
    let sentiment = 'NEUTRAL';
    let strength = 0;

    if (total > 0) {
      const ratio = bullishSignals / total;
      if (ratio > 0.7) { sentiment = 'BULLISH'; strength = bullishSignals; }
      else if (ratio < 0.3) { sentiment = 'BEARISH'; strength = bearishSignals; }
      else { sentiment = 'MIXED'; strength = Math.max(bullishSignals, bearishSignals); }
    }

    return {
      sentiment,
      bullishSignals,
      bearishSignals,
      strength: `${strength}/${total || 1}`,
      recommendation: sentiment === 'BULLISH' ? 'Consider LONG' :
                      sentiment === 'BEARISH' ? 'Consider SHORT' : 'Wait for clarity'
    };
  }
}

// =============================================================================
// PATTERN RECOGNITION ENGINE
// =============================================================================

class PatternRecognizer {
  static analyzeCandle(candle, index, allCandles) {
    const patterns = [];

    const open = parseFloat(candle.o);
    const high = parseFloat(candle.h);
    const low = parseFloat(candle.l);
    const close = parseFloat(candle.c);
    const volume = parseFloat(candle.v);

    const bodySize = Math.abs(close - open);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const totalRange = high - low;
    const isBullish = close > open;

    if (totalRange === 0) return patterns;

    // Doji patterns
    if (bodySize < totalRange * 0.1) {
      if (upperWick > lowerWick * 2.5) {
        patterns.push({
          name: 'Gravestone Doji',
          type: 'bearish',
          strength: 'medium',
          description: 'Strong rejection from highs - bearish reversal signal'
        });
      } else if (lowerWick > upperWick * 2.5) {
        patterns.push({
          name: 'Dragonfly Doji',
          type: 'bullish',
          strength: 'medium',
          description: 'Strong rejection from lows - bullish reversal signal'
        });
      } else {
        patterns.push({
          name: 'Doji',
          type: 'neutral',
          strength: 'weak',
          description: 'Market indecision - wait for confirmation'
        });
      }
    }

    // Hammer / Hanging Man
    if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5 && bodySize > totalRange * 0.1) {
      if (index >= 3) {
        const prevCandles = allCandles.slice(Math.max(0, index - 3), index);
        const avgClose = prevCandles.reduce((sum, c) => sum + parseFloat(c.c), 0) / prevCandles.length;
        const isDowntrend = close < avgClose;

        if (isDowntrend) {
          patterns.push({
            name: 'Hammer',
            type: 'bullish',
            strength: 'strong',
            description: 'Bullish reversal - buyers defended the low aggressively'
          });
        } else {
          patterns.push({
            name: 'Hanging Man',
            type: 'bearish',
            strength: 'medium',
            description: 'Warning signal after uptrend - potential reversal'
          });
        }
      }
    }

    // Shooting Star / Inverted Hammer
    if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && bodySize > totalRange * 0.1) {
      if (index >= 3) {
        const prevCandles = allCandles.slice(Math.max(0, index - 3), index);
        const avgClose = prevCandles.reduce((sum, c) => sum + parseFloat(c.c), 0) / prevCandles.length;
        const isUptrend = close > avgClose;

        if (isUptrend) {
          patterns.push({
            name: 'Shooting Star',
            type: 'bearish',
            strength: 'strong',
            description: 'Bearish reversal - sellers rejected the high aggressively'
          });
        } else {
          patterns.push({
            name: 'Inverted Hammer',
            type: 'bullish',
            strength: 'medium',
            description: 'Potential bullish reversal after downtrend'
          });
        }
      }
    }

    // Marubozu (strong momentum)
    if (upperWick < totalRange * 0.05 && lowerWick < totalRange * 0.05 && bodySize > totalRange * 0.9) {
      patterns.push({
        name: isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu',
        type: isBullish ? 'bullish' : 'bearish',
        strength: 'strong',
        description: isBullish
          ? 'Strong buying pressure - bulls in full control'
          : 'Strong selling pressure - bears in full control'
      });
    }

    // Engulfing patterns
    if (index > 0) {
      const prev = allCandles[index - 1];
      const prevOpen = parseFloat(prev.o);
      const prevClose = parseFloat(prev.c);
      const prevBody = Math.abs(prevClose - prevOpen);
      const prevBullish = prevClose > prevOpen;

      if (bodySize > prevBody * 1.3) {
        if (isBullish && !prevBullish && open <= prevClose && close >= prevOpen) {
          patterns.push({
            name: 'Bullish Engulfing',
            type: 'bullish',
            strength: 'strong',
            description: 'Strong reversal signal - buyers overwhelmed sellers'
          });
        }
        if (!isBullish && prevBullish && open >= prevClose && close <= prevOpen) {
          patterns.push({
            name: 'Bearish Engulfing',
            type: 'bearish',
            strength: 'strong',
            description: 'Strong reversal signal - sellers overwhelmed buyers'
          });
        }
      }
    }

    // Morning Star (3-candle bullish reversal)
    if (index >= 2) {
      const candle1 = allCandles[index - 2];
      const candle2 = allCandles[index - 1];

      const c1Body = Math.abs(parseFloat(candle1.c) - parseFloat(candle1.o));
      const c2Body = Math.abs(parseFloat(candle2.c) - parseFloat(candle2.o));
      const c3Body = bodySize;

      const c1Bearish = parseFloat(candle1.c) < parseFloat(candle1.o);
      const c3Bullish = isBullish;

      if (c1Bearish && c2Body < c1Body * 0.3 && c3Bullish && c3Body > c1Body * 0.5) {
        patterns.push({
          name: 'Morning Star',
          type: 'bullish',
          strength: 'strong',
          description: '3-candle bullish reversal - high probability setup'
        });
      }
    }

    // Evening Star (3-candle bearish reversal)
    if (index >= 2) {
      const candle1 = allCandles[index - 2];
      const candle2 = allCandles[index - 1];

      const c1Body = Math.abs(parseFloat(candle1.c) - parseFloat(candle1.o));
      const c2Body = Math.abs(parseFloat(candle2.c) - parseFloat(candle2.o));
      const c3Body = bodySize;

      const c1Bullish = parseFloat(candle1.c) > parseFloat(candle1.o);
      const c3Bearish = !isBullish;

      if (c1Bullish && c2Body < c1Body * 0.3 && c3Bearish && c3Body > c1Body * 0.5) {
        patterns.push({
          name: 'Evening Star',
          type: 'bearish',
          strength: 'strong',
          description: '3-candle bearish reversal - high probability setup'
        });
      }
    }

    // Volume analysis
    if (index >= 5) {
      const recentVolumes = allCandles.slice(index - 5, index).map(c => parseFloat(c.v));
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / 5;

      if (volume > avgVolume * 2) {
        patterns.push({
          name: 'High Volume',
          type: 'confirmation',
          strength: 'strong',
          description: `Volume ${(volume / avgVolume).toFixed(1)}x average - confirms the move`
        });
      }
    }

    // =========================================================================
    // ADVANCED CHART PATTERNS (Multi-bar patterns)
    // =========================================================================

    // Double Top Detection (bearish reversal)
    const doubleTop = this.detectDoubleTop(index, allCandles);
    if (doubleTop) patterns.push(doubleTop);

    // Double Bottom Detection (bullish reversal)
    const doubleBottom = this.detectDoubleBottom(index, allCandles);
    if (doubleBottom) patterns.push(doubleBottom);

    // Head and Shoulders Detection (bearish reversal)
    const headShoulders = this.detectHeadAndShoulders(index, allCandles);
    if (headShoulders) patterns.push(headShoulders);

    // Inverse Head and Shoulders Detection (bullish reversal)
    const inverseHS = this.detectInverseHeadAndShoulders(index, allCandles);
    if (inverseHS) patterns.push(inverseHS);

    // Rising Wedge Detection (bearish reversal)
    const risingWedge = this.detectRisingWedge(index, allCandles);
    if (risingWedge) patterns.push(risingWedge);

    // Falling Wedge Detection (bullish reversal)
    const fallingWedge = this.detectFallingWedge(index, allCandles);
    if (fallingWedge) patterns.push(fallingWedge);

    // V-shaped Reversal Detection
    const vReversal = this.detectVReversal(index, allCandles);
    if (vReversal) patterns.push(vReversal);

    return patterns;
  }

  // ===========================================================================
  // DOUBLE TOP DETECTION
  // Looks for two peaks at similar price levels with a trough between them
  // ===========================================================================
  static detectDoubleTop(index, allCandles) {
    if (index < 15) return null; // Need at least 15 candles

    const lookback = Math.min(30, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const highs = candles.map(c => parseFloat(c.h));
    const closes = candles.map(c => parseFloat(c.c));

    // Find local peaks (highs that are higher than neighbors)
    const peaks = [];
    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
          highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
        peaks.push({ index: i, value: highs[i] });
      }
    }

    if (peaks.length < 2) return null;

    // Check last two peaks for double top
    const peak1 = peaks[peaks.length - 2];
    const peak2 = peaks[peaks.length - 1];
    const priceTolerance = peak1.value * 0.02; // 2% tolerance

    // Peaks should be at similar levels
    if (Math.abs(peak1.value - peak2.value) > priceTolerance) return null;

    // Peaks should be separated by at least 5 candles
    if (peak2.index - peak1.index < 5) return null;

    // Find the trough between peaks
    const troughCandles = highs.slice(peak1.index, peak2.index + 1);
    const troughValue = Math.min(...troughCandles);
    const neckline = troughValue;

    // Current price should be breaking below neckline
    const currentClose = closes[closes.length - 1];
    if (currentClose < neckline) {
      return {
        name: 'Double Top',
        type: 'bearish',
        strength: 'strong',
        description: `Double top at $${peak1.value.toFixed(2)} - neckline break confirms reversal`
      };
    }

    // If price is near neckline, warn of potential breakdown
    if (currentClose < neckline * 1.02) {
      return {
        name: 'Double Top Forming',
        type: 'bearish',
        strength: 'medium',
        description: `Double top forming - watch for neckline break at $${neckline.toFixed(2)}`
      };
    }

    return null;
  }

  // ===========================================================================
  // DOUBLE BOTTOM DETECTION
  // Looks for two troughs at similar price levels with a peak between them
  // ===========================================================================
  static detectDoubleBottom(index, allCandles) {
    if (index < 15) return null;

    const lookback = Math.min(30, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const lows = candles.map(c => parseFloat(c.l));
    const closes = candles.map(c => parseFloat(c.c));

    // Find local troughs
    const troughs = [];
    for (let i = 2; i < lows.length - 2; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
          lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
        troughs.push({ index: i, value: lows[i] });
      }
    }

    if (troughs.length < 2) return null;

    const trough1 = troughs[troughs.length - 2];
    const trough2 = troughs[troughs.length - 1];
    const priceTolerance = trough1.value * 0.02;

    if (Math.abs(trough1.value - trough2.value) > priceTolerance) return null;
    if (trough2.index - trough1.index < 5) return null;

    // Find peak between troughs (neckline)
    const neckline = Math.max(...candles.slice(trough1.index, trough2.index + 1).map(c => parseFloat(c.h)));

    const currentClose = closes[closes.length - 1];
    if (currentClose > neckline) {
      return {
        name: 'Double Bottom',
        type: 'bullish',
        strength: 'strong',
        description: `Double bottom at $${trough1.value.toFixed(2)} - neckline break confirms reversal`
      };
    }

    if (currentClose > neckline * 0.98) {
      return {
        name: 'Double Bottom Forming',
        type: 'bullish',
        strength: 'medium',
        description: `Double bottom forming - watch for neckline break at $${neckline.toFixed(2)}`
      };
    }

    return null;
  }

  // ===========================================================================
  // HEAD AND SHOULDERS DETECTION
  // Classic bearish reversal: left shoulder, head (higher), right shoulder
  // ===========================================================================
  static detectHeadAndShoulders(index, allCandles) {
    if (index < 20) return null;

    const lookback = Math.min(40, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const highs = candles.map(c => parseFloat(c.h));
    const closes = candles.map(c => parseFloat(c.c));

    // Find peaks
    const peaks = [];
    for (let i = 3; i < highs.length - 3; i++) {
      if (highs[i] >= Math.max(...highs.slice(i - 3, i)) &&
          highs[i] >= Math.max(...highs.slice(i + 1, i + 4))) {
        peaks.push({ index: i, value: highs[i] });
      }
    }

    if (peaks.length < 3) return null;

    // Check last 3 peaks for H&S pattern
    for (let i = peaks.length - 3; i >= 0; i--) {
      const leftShoulder = peaks[i];
      const head = peaks[i + 1];
      const rightShoulder = peaks[i + 2];

      // Head must be higher than both shoulders
      if (head.value <= leftShoulder.value || head.value <= rightShoulder.value) continue;

      // Shoulders should be at similar levels (within 5%)
      const shoulderTolerance = leftShoulder.value * 0.05;
      if (Math.abs(leftShoulder.value - rightShoulder.value) > shoulderTolerance) continue;

      // Find neckline (connect the lows between shoulders and head)
      const lowBetweenLS_H = Math.min(...candles.slice(leftShoulder.index, head.index + 1).map(c => parseFloat(c.l)));
      const lowBetweenH_RS = Math.min(...candles.slice(head.index, rightShoulder.index + 1).map(c => parseFloat(c.l)));
      const neckline = Math.max(lowBetweenLS_H, lowBetweenH_RS);

      const currentClose = closes[closes.length - 1];

      if (currentClose < neckline) {
        return {
          name: 'Head & Shoulders',
          type: 'bearish',
          strength: 'strong',
          description: `H&S pattern confirmed - neckline broken at $${neckline.toFixed(2)}`
        };
      }

      if (currentClose < neckline * 1.02 && rightShoulder.index > peaks.length - 5) {
        return {
          name: 'Head & Shoulders Forming',
          type: 'bearish',
          strength: 'medium',
          description: `H&S forming - neckline at $${neckline.toFixed(2)}`
        };
      }
    }

    return null;
  }

  // ===========================================================================
  // INVERSE HEAD AND SHOULDERS DETECTION
  // Bullish reversal pattern
  // ===========================================================================
  static detectInverseHeadAndShoulders(index, allCandles) {
    if (index < 20) return null;

    const lookback = Math.min(40, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const lows = candles.map(c => parseFloat(c.l));
    const closes = candles.map(c => parseFloat(c.c));

    // Find troughs
    const troughs = [];
    for (let i = 3; i < lows.length - 3; i++) {
      if (lows[i] <= Math.min(...lows.slice(i - 3, i)) &&
          lows[i] <= Math.min(...lows.slice(i + 1, i + 4))) {
        troughs.push({ index: i, value: lows[i] });
      }
    }

    if (troughs.length < 3) return null;

    for (let i = troughs.length - 3; i >= 0; i--) {
      const leftShoulder = troughs[i];
      const head = troughs[i + 1];
      const rightShoulder = troughs[i + 2];

      // Head must be lower than both shoulders
      if (head.value >= leftShoulder.value || head.value >= rightShoulder.value) continue;

      // Shoulders at similar levels
      const shoulderTolerance = leftShoulder.value * 0.05;
      if (Math.abs(leftShoulder.value - rightShoulder.value) > shoulderTolerance) continue;

      // Find neckline
      const highBetweenLS_H = Math.max(...candles.slice(leftShoulder.index, head.index + 1).map(c => parseFloat(c.h)));
      const highBetweenH_RS = Math.max(...candles.slice(head.index, rightShoulder.index + 1).map(c => parseFloat(c.h)));
      const neckline = Math.min(highBetweenLS_H, highBetweenH_RS);

      const currentClose = closes[closes.length - 1];

      if (currentClose > neckline) {
        return {
          name: 'Inverse H&S',
          type: 'bullish',
          strength: 'strong',
          description: `Inverse H&S confirmed - neckline broken at $${neckline.toFixed(2)}`
        };
      }

      if (currentClose > neckline * 0.98 && rightShoulder.index > troughs.length - 5) {
        return {
          name: 'Inverse H&S Forming',
          type: 'bullish',
          strength: 'medium',
          description: `Inverse H&S forming - neckline at $${neckline.toFixed(2)}`
        };
      }
    }

    return null;
  }

  // ===========================================================================
  // RISING WEDGE DETECTION
  // Bearish pattern: converging trendlines with upward slope
  // ===========================================================================
  static detectRisingWedge(index, allCandles) {
    if (index < 12) return null;

    const lookback = Math.min(20, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));

    // Calculate trendlines using linear regression
    const highSlope = this.calculateSlope(highs);
    const lowSlope = this.calculateSlope(lows);

    // Rising wedge: both slopes positive, but lows rising faster than highs (converging)
    if (highSlope > 0 && lowSlope > 0 && lowSlope > highSlope * 0.5) {
      // Check for convergence
      const firstRange = highs[0] - lows[0];
      const lastRange = highs[highs.length - 1] - lows[lows.length - 1];

      if (lastRange < firstRange * 0.7) {
        // Check if price is near upper trendline (potential breakdown)
        const currentHigh = highs[highs.length - 1];
        const projectedHigh = highs[0] + highSlope * (highs.length - 1);

        if (Math.abs(currentHigh - projectedHigh) / projectedHigh < 0.02) {
          return {
            name: 'Rising Wedge',
            type: 'bearish',
            strength: 'strong',
            description: 'Rising wedge pattern - expect breakdown to the downside'
          };
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // FALLING WEDGE DETECTION
  // Bullish pattern: converging trendlines with downward slope
  // ===========================================================================
  static detectFallingWedge(index, allCandles) {
    if (index < 12) return null;

    const lookback = Math.min(20, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));

    const highSlope = this.calculateSlope(highs);
    const lowSlope = this.calculateSlope(lows);

    // Falling wedge: both slopes negative, but highs falling faster than lows (converging)
    if (highSlope < 0 && lowSlope < 0 && highSlope < lowSlope * 0.5) {
      const firstRange = highs[0] - lows[0];
      const lastRange = highs[highs.length - 1] - lows[lows.length - 1];

      if (lastRange < firstRange * 0.7) {
        const currentLow = lows[lows.length - 1];
        const projectedLow = lows[0] + lowSlope * (lows.length - 1);

        if (Math.abs(currentLow - projectedLow) / projectedLow < 0.02) {
          return {
            name: 'Falling Wedge',
            type: 'bullish',
            strength: 'strong',
            description: 'Falling wedge pattern - expect breakout to the upside'
          };
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // V-SHAPED REVERSAL DETECTION
  // Sharp reversal with high momentum (common in crypto due to liquidations)
  // ===========================================================================
  static detectVReversal(index, allCandles) {
    if (index < 10) return null;

    const lookback = Math.min(15, index);
    const candles = allCandles.slice(index - lookback, index + 1);
    const closes = candles.map(c => parseFloat(c.c));
    const volumes = candles.map(c => parseFloat(c.v));

    // Find the pivot point (lowest or highest point)
    const minIndex = closes.indexOf(Math.min(...closes));
    const maxIndex = closes.indexOf(Math.max(...closes));

    // V-Bottom (bullish): sharp drop followed by sharp recovery
    if (minIndex > 2 && minIndex < closes.length - 3) {
      const dropBefore = closes.slice(0, minIndex + 1);
      const recoveryAfter = closes.slice(minIndex);

      const dropPercent = (dropBefore[0] - dropBefore[dropBefore.length - 1]) / dropBefore[0] * 100;
      const recoveryPercent = (recoveryAfter[recoveryAfter.length - 1] - recoveryAfter[0]) / recoveryAfter[0] * 100;

      // Sharp drop (>5%) followed by strong recovery (>70% of the drop)
      if (dropPercent > 5 && recoveryPercent > dropPercent * 0.7) {
        // Check for volume spike at pivot
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const pivotVolume = volumes[minIndex];

        if (pivotVolume > avgVolume * 1.5) {
          return {
            name: 'V-Bottom Reversal',
            type: 'bullish',
            strength: 'strong',
            description: `Sharp V-reversal from $${closes[minIndex].toFixed(2)} - momentum buying`
          };
        }
      }
    }

    // Inverted V-Top (bearish): sharp rally followed by sharp selloff
    if (maxIndex > 2 && maxIndex < closes.length - 3) {
      const rallyBefore = closes.slice(0, maxIndex + 1);
      const selloffAfter = closes.slice(maxIndex);

      const rallyPercent = (rallyBefore[rallyBefore.length - 1] - rallyBefore[0]) / rallyBefore[0] * 100;
      const selloffPercent = (selloffAfter[0] - selloffAfter[selloffAfter.length - 1]) / selloffAfter[0] * 100;

      if (rallyPercent > 5 && selloffPercent > rallyPercent * 0.7) {
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const pivotVolume = volumes[maxIndex];

        if (pivotVolume > avgVolume * 1.5) {
          return {
            name: 'V-Top Reversal',
            type: 'bearish',
            strength: 'strong',
            description: `Sharp V-top reversal from $${closes[maxIndex].toFixed(2)} - momentum selling`
          };
        }
      }
    }

    return null;
  }

  // Helper: Calculate slope using simple linear regression
  static calculateSlope(values) {
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  static generateDecision(patterns, candle, allCandles) {
    // Calculate technical indicators for enhanced decision making
    const indicators = allCandles.length >= 30 ? TechnicalIndicators.calculateAll(allCandles) : null;

    if (!patterns || patterns.length === 0) {
      // Even without patterns, check indicator signals
      if (indicators?.summary) {
        const summary = indicators.summary;
        if (summary.sentiment !== 'NEUTRAL' && summary.sentiment !== 'MIXED') {
          return {
            action: 'WAIT',
            confidence: 'low',
            entry: null,
            stopLoss: null,
            target1: null,
            target2: null,
            riskReward: null,
            reasoning: [
              'No clear candlestick pattern',
              `Indicators suggest ${summary.sentiment} bias (${summary.strength})`,
              summary.recommendation
            ],
            indicatorSignals: this.getIndicatorSignals(indicators)
          };
        }
      }
      return {
        action: 'WAIT',
        confidence: 'none',
        entry: null,
        stopLoss: null,
        target1: null,
        target2: null,
        riskReward: null,
        reasoning: ['No clear pattern detected', 'Wait for setup'],
        indicatorSignals: indicators ? this.getIndicatorSignals(indicators) : null
      };
    }

    const high = parseFloat(candle.h);
    const low = parseFloat(candle.l);
    const range = high - low;

    const strongBullish = patterns.some(p => p.type === 'bullish' && p.strength === 'strong');
    const strongBearish = patterns.some(p => p.type === 'bearish' && p.strength === 'strong');
    const hasVolumeConfirm = patterns.some(p => p.name === 'High Volume');
    const mediumBullish = patterns.some(p => p.type === 'bullish' && p.strength === 'medium');
    const mediumBearish = patterns.some(p => p.type === 'bearish' && p.strength === 'medium');

    // Check if indicators align with patterns
    let indicatorBoost = false;
    let indicatorConflict = false;

    if (indicators?.summary) {
      const sentiment = indicators.summary.sentiment;
      if ((strongBullish || mediumBullish) && sentiment === 'BULLISH') {
        indicatorBoost = true;
      } else if ((strongBearish || mediumBearish) && sentiment === 'BEARISH') {
        indicatorBoost = true;
      } else if ((strongBullish || mediumBullish) && sentiment === 'BEARISH') {
        indicatorConflict = true;
      } else if ((strongBearish || mediumBearish) && sentiment === 'BULLISH') {
        indicatorConflict = true;
      }
    }

    let decision = {
      action: 'WAIT',
      confidence: 'low',
      entry: null,
      stopLoss: null,
      target1: null,
      target2: null,
      target3: null,
      riskReward: null,
      reasoning: [],
      indicatorSignals: indicators ? this.getIndicatorSignals(indicators) : null
    };

    if (strongBullish || (mediumBullish && hasVolumeConfirm) || (mediumBullish && indicatorBoost)) {
      const entry = high + (range * 0.01);

      // Use ATR for dynamic stop loss if available
      let stopLoss;
      if (indicators?.atr) {
        stopLoss = low - (indicators.atr.atr * 1.5);
      } else {
        stopLoss = low - (range * 0.15);
      }

      const risk = entry - stopLoss;
      const target1 = entry + risk * 1.5;
      const target2 = entry + risk * 2.5;
      const target3 = entry + risk * 4;

      // Determine confidence level
      let confidence = 'low';
      if (strongBullish && hasVolumeConfirm && indicatorBoost) confidence = 'high';
      else if (strongBullish && (hasVolumeConfirm || indicatorBoost)) confidence = 'high';
      else if (strongBullish) confidence = 'medium';
      else if (mediumBullish && (hasVolumeConfirm || indicatorBoost)) confidence = 'medium';

      // Reduce confidence if indicators conflict
      if (indicatorConflict) {
        confidence = confidence === 'high' ? 'medium' : 'low';
      }

      const reasoning = [
        patterns.find(p => p.type === 'bullish')?.description || 'Bullish pattern detected',
        hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
      ];

      // Add indicator reasoning
      if (indicators) {
        if (indicatorBoost) reasoning.push('✓ Indicators align with bullish signal');
        if (indicatorConflict) reasoning.push('⚠ Indicators show conflicting bearish signals');
        if (indicators.rsi !== null) {
          if (indicators.rsi < 30) reasoning.push(`✓ RSI oversold (${indicators.rsi.toFixed(1)}) - good entry`);
          else if (indicators.rsi > 70) reasoning.push(`⚠ RSI overbought (${indicators.rsi.toFixed(1)}) - caution`);
        }
        if (indicators.macd?.trend === 'bullish_crossover') {
          reasoning.push('✓ MACD bullish crossover');
        }
      }

      reasoning.push('Entry: Break above candle high');
      reasoning.push(`Risk: ${((risk / entry) * 100).toFixed(2)}% to stop loss`);

      decision = {
        action: 'LONG',
        confidence,
        entry: parseFloat(entry.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        target1: parseFloat(target1.toFixed(2)),
        target2: parseFloat(target2.toFixed(2)),
        target3: parseFloat(target3.toFixed(2)),
        riskReward: '1:2.5',
        reasoning,
        indicatorSignals: indicators ? this.getIndicatorSignals(indicators) : null
      };
    } else if (strongBearish || (mediumBearish && hasVolumeConfirm) || (mediumBearish && indicatorBoost)) {
      const entry = low - (range * 0.01);

      // Use ATR for dynamic stop loss if available
      let stopLoss;
      if (indicators?.atr) {
        stopLoss = high + (indicators.atr.atr * 1.5);
      } else {
        stopLoss = high + (range * 0.15);
      }

      const risk = stopLoss - entry;
      const target1 = entry - risk * 1.5;
      const target2 = entry - risk * 2.5;
      const target3 = entry - risk * 4;

      // Determine confidence level
      let confidence = 'low';
      if (strongBearish && hasVolumeConfirm && indicatorBoost) confidence = 'high';
      else if (strongBearish && (hasVolumeConfirm || indicatorBoost)) confidence = 'high';
      else if (strongBearish) confidence = 'medium';
      else if (mediumBearish && (hasVolumeConfirm || indicatorBoost)) confidence = 'medium';

      // Reduce confidence if indicators conflict
      if (indicatorConflict) {
        confidence = confidence === 'high' ? 'medium' : 'low';
      }

      const reasoning = [
        patterns.find(p => p.type === 'bearish')?.description || 'Bearish pattern detected',
        hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
      ];

      // Add indicator reasoning
      if (indicators) {
        if (indicatorBoost) reasoning.push('✓ Indicators align with bearish signal');
        if (indicatorConflict) reasoning.push('⚠ Indicators show conflicting bullish signals');
        if (indicators.rsi !== null) {
          if (indicators.rsi > 70) reasoning.push(`✓ RSI overbought (${indicators.rsi.toFixed(1)}) - good entry`);
          else if (indicators.rsi < 30) reasoning.push(`⚠ RSI oversold (${indicators.rsi.toFixed(1)}) - caution`);
        }
        if (indicators.macd?.trend === 'bearish_crossover') {
          reasoning.push('✓ MACD bearish crossover');
        }
      }

      reasoning.push('Entry: Break below candle low');
      reasoning.push(`Risk: ${((risk / entry) * 100).toFixed(2)}% to stop loss`);

      decision = {
        action: 'SHORT',
        confidence,
        entry: parseFloat(entry.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        target1: parseFloat(target1.toFixed(2)),
        target2: parseFloat(target2.toFixed(2)),
        target3: parseFloat(target3.toFixed(2)),
        riskReward: '1:2.5',
        reasoning,
        indicatorSignals: indicators ? this.getIndicatorSignals(indicators) : null
      };
    } else {
      decision.reasoning = [
        'Pattern detected but not strong enough',
        'Wait for confirmation or stronger setup'
      ];
      if (indicators?.summary) {
        decision.reasoning.push(`Indicator sentiment: ${indicators.summary.sentiment} (${indicators.summary.strength})`);
      }
    }

    return decision;
  }

  // Helper to extract key indicator signals for the decision
  static getIndicatorSignals(indicators) {
    if (!indicators) return null;

    return {
      rsi: indicators.rsi !== null ? {
        value: parseFloat(indicators.rsi.toFixed(1)),
        signal: indicators.rsi < 30 ? 'oversold' : indicators.rsi > 70 ? 'overbought' : 'neutral'
      } : null,
      macd: indicators.macd ? {
        trend: indicators.macd.trend,
        histogram: indicators.macd.histogram
      } : null,
      stochastic: indicators.stochastic ? {
        k: indicators.stochastic.k,
        d: indicators.stochastic.d,
        signal: indicators.stochastic.signal
      } : null,
      adx: indicators.adx ? {
        value: indicators.adx.adx,
        trend: indicators.adx.trend,
        direction: indicators.adx.direction
      } : null,
      bollingerBands: indicators.bollingerBands ? {
        signal: indicators.bollingerBands.signal,
        percentB: indicators.bollingerBands.percentB
      } : null,
      obv: indicators.obv ? {
        trend: indicators.obv.trend
      } : null,
      elliottWave: indicators.elliottWave ? {
        pattern: indicators.elliottWave.pattern,
        wave: indicators.elliottWave.wave,
        projection: indicators.elliottWave.projection
      } : null,
      summary: indicators.summary
    };
  }
}

// =============================================================================
// BINANCE WEBSOCKET CONNECTION
// =============================================================================

let binanceWs = null;
let binanceReconnectTimeout = null;

function connectToBinance() {
  console.log('🔌 Connecting to Binance WebSocket...');

  const streams = [];
  CONFIG.INSTRUMENTS.forEach(instrument => {
    const symbol = instrument.toLowerCase();
    streams.push(`${symbol}@ticker`);
    CONFIG.TIMEFRAMES.forEach(tf => {
      streams.push(`${symbol}@kline_${tf}`);
    });
  });

  const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
  binanceWs = new WebSocket(streamUrl);

  binanceWs.on('open', () => {
    console.log('✅ Binance connected');
    fetchAllHistoricalData();
  });

  binanceWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleBinanceMessage(message);
    } catch (err) {
      console.error('Binance parse error:', err.message);
    }
  });

  binanceWs.on('error', (error) => {
    console.error('❌ Binance error:', error.message);
  });

  binanceWs.on('close', () => {
    console.log('🔌 Binance disconnected. Reconnecting...');
    if (binanceReconnectTimeout) clearTimeout(binanceReconnectTimeout);
    binanceReconnectTimeout = setTimeout(connectToBinance, CONFIG.RECONNECT_DELAY);
  });
}

function handleBinanceMessage(message) {
  if (!message.stream || !message.data) return;

  const stream = message.stream;
  const data = message.data;

  if (stream.endsWith('@ticker')) {
    const symbol = data.s;
    const displayName = CONFIG.INSTRUMENT_DISPLAY[symbol];

    if (displayName) {
      const price = parseFloat(data.c) || 0;
      dataStore.exchangePrices.binance[displayName] = price;

      // Store additional data from Binance (it has the most complete data)
      const ticker = dataStore.tickers[displayName];
      ticker.high24h = parseFloat(data.h) || 0;
      ticker.low24h = parseFloat(data.l) || 0;
      ticker.volume = parseFloat(data.v) || 0;
      ticker.change = parseFloat(data.P) || 0;

      updateAggregatedTicker(displayName);
    }
  }

  if (stream.includes('@kline_')) {
    const symbol = data.s;
    const displayName = CONFIG.INSTRUMENT_DISPLAY[symbol];
    const kline = data.k;
    const timeframe = kline.i;
    const key = `${displayName}_${timeframe}`;

    if (displayName && dataStore.candles[key] !== undefined) {
      const candle = {
        t: kline.t,
        o: kline.o,
        h: kline.h,
        l: kline.l,
        c: kline.c,
        v: kline.v,
        T: kline.T,
        isClosed: kline.x
      };

      const existingIndex = dataStore.candles[key].findIndex(c => c.t === candle.t);

      if (existingIndex >= 0) {
        dataStore.candles[key][existingIndex] = candle;
      } else {
        dataStore.candles[key].push(candle);
        if (dataStore.candles[key].length > 100) {
          dataStore.candles[key].shift();
        }
      }

      dataStore.candles[key].sort((a, b) => a.t - b.t);

      const allCandles = dataStore.candles[key];
      if (allCandles.length >= 3) {
        const latestCandle = allCandles[allCandles.length - 1];
        const patterns = PatternRecognizer.analyzeCandle(latestCandle, allCandles.length - 1, allCandles);
        dataStore.patterns[key] = patterns;
        dataStore.decisions[key] = PatternRecognizer.generateDecision(patterns, latestCandle, allCandles);

        broadcastToClients('candle_update', {
          instrument: displayName,
          timeframe,
          candle: latestCandle,
          patterns,
          decision: dataStore.decisions[key],
          allCandles: allCandles.slice(-50)
        });
      }
    }
  }
}

// =============================================================================
// COINBASE WEBSOCKET CONNECTION
// =============================================================================

let coinbaseWs = null;
let coinbaseReconnectTimeout = null;

function connectToCoinbase() {
  console.log('🔌 Connecting to Coinbase WebSocket...');

  coinbaseWs = new WebSocket('wss://ws-feed.exchange.coinbase.com');

  coinbaseWs.on('open', () => {
    console.log('✅ Coinbase connected');

    // Subscribe to ticker channel
    const productIds = Object.values(CONFIG.COINBASE_SYMBOLS);
    coinbaseWs.send(JSON.stringify({
      type: 'subscribe',
      product_ids: productIds,
      channels: ['ticker']
    }));
  });

  coinbaseWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleCoinbaseMessage(message);
    } catch (err) {
      console.error('Coinbase parse error:', err.message);
    }
  });

  coinbaseWs.on('error', (error) => {
    console.error('❌ Coinbase error:', error.message);
  });

  coinbaseWs.on('close', () => {
    console.log('🔌 Coinbase disconnected. Reconnecting...');
    if (coinbaseReconnectTimeout) clearTimeout(coinbaseReconnectTimeout);
    coinbaseReconnectTimeout = setTimeout(connectToCoinbase, CONFIG.RECONNECT_DELAY);
  });
}

function handleCoinbaseMessage(message) {
  if (message.type !== 'ticker') return;

  const productId = message.product_id;

  // Find the display name for this product
  let displayName = null;
  for (const [display, coinbaseSymbol] of Object.entries(CONFIG.COINBASE_SYMBOLS)) {
    if (coinbaseSymbol === productId) {
      displayName = display;
      break;
    }
  }

  if (displayName && message.price) {
    const price = parseFloat(message.price) || 0;
    dataStore.exchangePrices.coinbase[displayName] = price;
    updateAggregatedTicker(displayName);
  }
}

// =============================================================================
// KRAKEN WEBSOCKET CONNECTION
// =============================================================================

let krakenWs = null;
let krakenReconnectTimeout = null;

function connectToKraken() {
  console.log('🔌 Connecting to Kraken WebSocket...');

  krakenWs = new WebSocket('wss://ws.kraken.com');

  krakenWs.on('open', () => {
    console.log('✅ Kraken connected');

    // Subscribe to ticker channel
    const pairs = Object.values(CONFIG.KRAKEN_SYMBOLS);
    krakenWs.send(JSON.stringify({
      event: 'subscribe',
      pair: pairs,
      subscription: { name: 'ticker' }
    }));
  });

  krakenWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleKrakenMessage(message);
    } catch (err) {
      console.error('Kraken parse error:', err.message);
    }
  });

  krakenWs.on('error', (error) => {
    console.error('❌ Kraken error:', error.message);
  });

  krakenWs.on('close', () => {
    console.log('🔌 Kraken disconnected. Reconnecting...');
    if (krakenReconnectTimeout) clearTimeout(krakenReconnectTimeout);
    krakenReconnectTimeout = setTimeout(connectToKraken, CONFIG.RECONNECT_DELAY);
  });
}

function handleKrakenMessage(message) {
  // Kraken sends arrays for ticker data: [channelID, data, channelName, pair]
  if (!Array.isArray(message) || message.length < 4) return;

  const tickerData = message[1];
  const pair = message[3];

  if (!tickerData || !tickerData.c) return;

  // Find the display name for this pair
  let displayName = null;
  for (const [display, krakenSymbol] of Object.entries(CONFIG.KRAKEN_SYMBOLS)) {
    if (krakenSymbol === pair) {
      displayName = display;
      break;
    }
  }

  if (displayName) {
    // Kraken ticker format: c = close [price, lot volume]
    const price = parseFloat(tickerData.c[0]) || 0;
    dataStore.exchangePrices.kraken[displayName] = price;
    updateAggregatedTicker(displayName);
  }
}

// =============================================================================
// CLIENT WEBSOCKET HANDLING
// =============================================================================

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  clients.add(ws);

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      tickers: dataStore.tickers,
      candles: dataStore.candles,
      patterns: dataStore.patterns,
      decisions: dataStore.decisions
    }
  }));

  ws.on('close', () => {
    console.log('👤 Client disconnected');
    clients.delete(ws);
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(ws, data);
    } catch (err) {
      console.error('Error handling client message:', err);
    }
  });
});

function handleClientMessage(ws, data) {
  switch (data.type) {
    case 'subscribe':
      const key = `${data.instrument}_${data.timeframe}`;
      ws.send(JSON.stringify({
        type: 'candle_update',
        data: {
          instrument: data.instrument,
          timeframe: data.timeframe,
          allCandles: dataStore.candles[key] || [],
          patterns: dataStore.patterns[key] || [],
          decision: dataStore.decisions[key]
        }
      }));
      break;
  }
}

function broadcastToClients(type, data) {
  const message = JSON.stringify({ type, data });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// =============================================================================
// REST API FOR HISTORICAL DATA
// =============================================================================

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllHistoricalData() {
  const startTime = Date.now();

  // Step 1: Try to load from Redis cache first (instant)
  const cacheLoaded = await loadAllFromCache();

  if (cacheLoaded) {
    // Background refresh: fetch fresh data without blocking
    console.log('🔄 Refreshing data from API in background...');
    fetchFreshDataInBackground();
    return;
  }

  // Step 2: No cache - fetch from API with parallel requests
  console.log('📥 Fetching historical candle data from API...');

  // Fetch all instruments in parallel (5 at a time to avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < CONFIG.INSTRUMENTS.length; i += batchSize) {
    const batch = CONFIG.INSTRUMENTS.slice(i, i + batchSize);
    const promises = [];

    for (const instrument of batch) {
      for (const tf of CONFIG.TIMEFRAMES) {
        promises.push(fetchHistoricalCandles(instrument, tf));
      }
    }

    await Promise.all(promises);
    // Small delay between batches to respect rate limits
    if (i + batchSize < CONFIG.INSTRUMENTS.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`✅ Historical data loaded in ${elapsed}ms`);
}

async function fetchFreshDataInBackground() {
  // Fetch fresh data in background without blocking
  for (const instrument of CONFIG.INSTRUMENTS) {
    for (const tf of CONFIG.TIMEFRAMES) {
      fetchHistoricalCandles(instrument, tf).catch(() => {});
    }
    // Small delay between instruments
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('✅ Background data refresh complete');
}

async function fetchHistoricalCandles(instrument, timeframe) {
  try {
    const displayName = CONFIG.INSTRUMENT_DISPLAY[instrument];
    const key = `${displayName}_${timeframe}`;

    const url = `https://api.binance.com/api/v3/klines?symbol=${instrument}&interval=${timeframe}&limit=100`;
    const data = await httpsGet(url);

    if (Array.isArray(data)) {
      const candles = data.map(k => ({
        t: k[0],
        o: k[1],
        h: k[2],
        l: k[3],
        c: k[4],
        v: k[5],
        T: k[6],
        isClosed: true
      }));

      if (dataStore.candles[key] !== undefined) {
        dataStore.candles[key] = candles;

        if (candles.length >= 3) {
          const latestCandle = candles[candles.length - 1];
          const patterns = PatternRecognizer.analyzeCandle(latestCandle, candles.length - 1, candles);
          dataStore.patterns[key] = patterns;
          dataStore.decisions[key] = PatternRecognizer.generateDecision(patterns, latestCandle, candles);
        }

        // Calculate technical indicators
        if (candles.length >= 30) {
          dataStore.indicators[key] = TechnicalIndicators.calculateAll(candles);
        }

        // Cache to Redis
        setCachedCandles(instrument, timeframe, candles);
      }

      return candles;
    }
    return [];
  } catch (err) {
    console.error(`Error fetching ${instrument} ${timeframe}:`, err.message);
    return [];
  }
}

// REST endpoints
app.get('/api/instruments', (req, res) => {
  res.json(Object.values(CONFIG.INSTRUMENT_DISPLAY));
});

app.get('/api/candles/:instrument/:timeframe', async (req, res) => {
  const { instrument, timeframe } = req.params;
  const key = `${instrument}_${timeframe}`;

  if (dataStore.candles[key] && dataStore.candles[key].length > 0) {
    res.json({
      candles: dataStore.candles[key],
      patterns: dataStore.patterns[key],
      decision: dataStore.decisions[key],
      indicators: dataStore.indicators[key]
    });
  } else {
    const candles = await fetchHistoricalCandles(instrument, timeframe);
    res.json({ candles, patterns: [], decision: null, indicators: null });
  }
});

// Get indicators only (lighter endpoint)
app.get('/api/indicators/:instrument/:timeframe', async (req, res) => {
  const { instrument, timeframe } = req.params;
  const key = `${instrument}_${timeframe}`;

  if (dataStore.indicators[key]) {
    res.json(dataStore.indicators[key]);
  } else if (dataStore.candles[key] && dataStore.candles[key].length >= 30) {
    const indicators = TechnicalIndicators.calculateAll(dataStore.candles[key]);
    dataStore.indicators[key] = indicators;
    res.json(indicators);
  } else {
    res.json({ error: 'Insufficient data for indicators (need 30+ candles)' });
  }
});

app.get('/api/tickers', (req, res) => {
  res.json(dataStore.tickers);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    exchanges: {
      binance: binanceWs?.readyState === WebSocket.OPEN,
      coinbase: coinbaseWs?.readyState === WebSocket.OPEN,
      kraken: krakenWs?.readyState === WebSocket.OPEN
    },
    clients: clients.size
  });
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       🚀 Trading Decision Framework Server Started 🚀          ║
╠═══════════════════════════════════════════════════════════════╣
║  REST API:     http://localhost:${PORT}                          ║
║  WebSocket:    ws://localhost:${PORT}                            ║
║  Health:       http://localhost:${PORT}/health                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Instruments:  Top 10 Pairs (USDT)                            ║
║  BTC, ETH, BNB, XRP, ADA, SOL, DOGE, DOT, MATIC, LTC          ║
║  Timeframes:   1m, 5m, 15m, 1h, 4h                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Data Sources: Binance + Coinbase + Kraken (Aggregated)       ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Connect to all exchanges
  connectToBinance();
  connectToCoinbase();
  connectToKraken();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (binanceWs) binanceWs.close();
  if (coinbaseWs) coinbaseWs.close();
  if (krakenWs) krakenWs.close();
  if (USE_REDIS && redisConnected && redis) redis.quit();
  wss.close();
  server.close();
  process.exit(0);
});
