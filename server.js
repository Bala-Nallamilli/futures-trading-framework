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
    'SOLUSDT', 'DOGEUSDT', 'DOTUSDT', 'POLUSDT', 'LTCUSDT'
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
    'LTCUSDT': 'LTC_USDT'
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
    'ADA_USDT': 'ADA-USD'
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
    'ADA_USDT': 'ADA/USD'
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
// TECHNICAL INDICATORS
// =============================================================================

class TechnicalIndicators {
  // Calculate RSI (Relative Strength Index)
  static calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const closes = candles.map(c => parseFloat(c.c));
    const gains = [];
    const losses = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  // Calculate MACD (Moving Average Convergence Divergence)
  static calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (candles.length < slowPeriod) return null;

    const closes = candles.map(c => parseFloat(c.c));

    const emaFast = this.calculateEMA(closes, fastPeriod);
    const emaSlow = this.calculateEMA(closes, slowPeriod);

    if (!emaFast || !emaSlow) return null;

    const macdLine = emaFast - emaSlow;

    // For simplicity, using SMA for signal line (normally would use EMA of MACD)
    const macdHistory = [macdLine]; // In practice, you'd need historical MACD values
    const signal = macdLine; // Simplified

    return {
      macd: macdLine,
      signal: signal,
      histogram: macdLine - signal
    };
  }

  // Calculate EMA (Exponential Moving Average)
  static calculateEMA(values, period) {
    if (values.length < period) return null;

    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] * k) + (ema * (1 - k));
    }

    return ema;
  }

  // Calculate SMA (Simple Moving Average)
  static calculateSMA(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  // Calculate Bollinger Bands
  static calculateBollingerBands(candles, period = 20, stdDev = 2) {
    if (candles.length < period) return null;

    const closes = candles.map(c => parseFloat(c.c));
    const sma = this.calculateSMA(closes, period);

    if (!sma) return null;

    // Calculate standard deviation
    const slice = closes.slice(-period);
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  // Calculate ATR (Average True Range)
  static calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const trueRanges = [];

    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i].h);
      const low = parseFloat(candles[i].l);
      const prevClose = parseFloat(candles[i - 1].c);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    return this.calculateSMA(trueRanges, period);
  }

  // Calculate Stochastic Oscillator
  static calculateStochastic(candles, period = 14) {
    if (candles.length < period) return null;

    const recentCandles = candles.slice(-period);
    const currentClose = parseFloat(candles[candles.length - 1].c);
    const highestHigh = Math.max(...recentCandles.map(c => parseFloat(c.h)));
    const lowestLow = Math.min(...recentCandles.map(c => parseFloat(c.l)));

    if (highestHigh === lowestLow) return 50;

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    return k;
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
      } else if (volume < avgVolume * 0.5) {
        patterns.push({
          name: 'Low Volume',
          type: 'warning',
          strength: 'weak',
          description: `Volume ${(volume / avgVolume).toFixed(1)}x average - weak participation`
        });
      }
    }

    // Tweezer Top/Bottom
    if (index > 0) {
      const prev = allCandles[index - 1];
      const prevHigh = parseFloat(prev.h);
      const prevLow = parseFloat(prev.l);
      const prevBullish = parseFloat(prev.c) > parseFloat(prev.o);

      // Tweezer Top
      if (Math.abs(high - prevHigh) < totalRange * 0.1 && prevBullish && !isBullish) {
        patterns.push({
          name: 'Tweezer Top',
          type: 'bearish',
          strength: 'medium',
          description: 'Double rejection at resistance - bearish reversal'
        });
      }

      // Tweezer Bottom
      if (Math.abs(low - prevLow) < totalRange * 0.1 && !prevBullish && isBullish) {
        patterns.push({
          name: 'Tweezer Bottom',
          type: 'bullish',
          strength: 'medium',
          description: 'Double rejection at support - bullish reversal'
        });
      }
    }

    // Piercing Line / Dark Cloud Cover
    if (index > 0) {
      const prev = allCandles[index - 1];
      const prevOpen = parseFloat(prev.o);
      const prevClose = parseFloat(prev.c);
      const prevBullish = prevClose > prevOpen;
      const prevMidpoint = (prevOpen + prevClose) / 2;

      // Piercing Line (bullish)
      if (!prevBullish && isBullish && open < prevClose && close > prevMidpoint && close < prevOpen) {
        patterns.push({
          name: 'Piercing Line',
          type: 'bullish',
          strength: 'strong',
          description: 'Bullish reversal - buyers pushing back strongly'
        });
      }

      // Dark Cloud Cover (bearish)
      if (prevBullish && !isBullish && open > prevClose && close < prevMidpoint && close > prevOpen) {
        patterns.push({
          name: 'Dark Cloud Cover',
          type: 'bearish',
          strength: 'strong',
          description: 'Bearish reversal - sellers taking control'
        });
      }
    }

    // Three White Soldiers / Three Black Crows
    if (index >= 2) {
      const c1 = allCandles[index - 2];
      const c2 = allCandles[index - 1];
      const c3 = candle;

      const c1Bullish = parseFloat(c1.c) > parseFloat(c1.o);
      const c2Bullish = parseFloat(c2.c) > parseFloat(c2.o);
      const c3Bullish = close > open;

      const c1Bearish = parseFloat(c1.c) < parseFloat(c1.o);
      const c2Bearish = parseFloat(c2.c) < parseFloat(c2.o);
      const c3Bearish = close < open;

      // Three White Soldiers
      if (c1Bullish && c2Bullish && c3Bullish &&
          parseFloat(c2.c) > parseFloat(c1.c) &&
          close > parseFloat(c2.c)) {
        patterns.push({
          name: 'Three White Soldiers',
          type: 'bullish',
          strength: 'strong',
          description: 'Strong bullish continuation - sustained buying pressure'
        });
      }

      // Three Black Crows
      if (c1Bearish && c2Bearish && c3Bearish &&
          parseFloat(c2.c) < parseFloat(c1.c) &&
          close < parseFloat(c2.c)) {
        patterns.push({
          name: 'Three Black Crows',
          type: 'bearish',
          strength: 'strong',
          description: 'Strong bearish continuation - sustained selling pressure'
        });
      }
    }

    // Add technical indicators analysis
    const indicators = this.analyzeTechnicalIndicators(allCandles);
    if (indicators) {
      patterns.push(...indicators);
    }

    return patterns;
  }

  // Analyze technical indicators
  static analyzeTechnicalIndicators(allCandles) {
    const indicators = [];

    // RSI Analysis
    const rsi = TechnicalIndicators.calculateRSI(allCandles);
    if (rsi !== null) {
      if (rsi > 70) {
        indicators.push({
          name: 'RSI Overbought',
          type: 'bearish',
          strength: 'medium',
          description: `RSI: ${rsi.toFixed(1)} - Overbought, potential reversal`
        });
      } else if (rsi < 30) {
        indicators.push({
          name: 'RSI Oversold',
          type: 'bullish',
          strength: 'medium',
          description: `RSI: ${rsi.toFixed(1)} - Oversold, potential reversal`
        });
      } else if (rsi > 50 && rsi < 70) {
        indicators.push({
          name: 'RSI Bullish',
          type: 'bullish',
          strength: 'weak',
          description: `RSI: ${rsi.toFixed(1)} - Bullish momentum`
        });
      } else if (rsi < 50 && rsi > 30) {
        indicators.push({
          name: 'RSI Bearish',
          type: 'bearish',
          strength: 'weak',
          description: `RSI: ${rsi.toFixed(1)} - Bearish momentum`
        });
      }
    }

    // Bollinger Bands Analysis
    const bb = TechnicalIndicators.calculateBollingerBands(allCandles);
    if (bb) {
      const currentPrice = parseFloat(allCandles[allCandles.length - 1].c);

      if (currentPrice > bb.upper) {
        indicators.push({
          name: 'BB Upper Break',
          type: 'warning',
          strength: 'medium',
          description: 'Price above upper band - overbought or strong trend'
        });
      } else if (currentPrice < bb.lower) {
        indicators.push({
          name: 'BB Lower Break',
          type: 'warning',
          strength: 'medium',
          description: 'Price below lower band - oversold or strong downtrend'
        });
      }

      // BB Squeeze
      const bandwidth = ((bb.upper - bb.lower) / bb.middle) * 100;
      if (bandwidth < 5) {
        indicators.push({
          name: 'BB Squeeze',
          type: 'neutral',
          strength: 'medium',
          description: 'Bollinger Bands squeeze - volatility breakout expected'
        });
      }
    }

    // MACD Analysis
    const macd = TechnicalIndicators.calculateMACD(allCandles);
    if (macd) {
      if (macd.histogram > 0 && macd.macd > macd.signal) {
        indicators.push({
          name: 'MACD Bullish',
          type: 'bullish',
          strength: 'medium',
          description: 'MACD above signal - bullish momentum'
        });
      } else if (macd.histogram < 0 && macd.macd < macd.signal) {
        indicators.push({
          name: 'MACD Bearish',
          type: 'bearish',
          strength: 'medium',
          description: 'MACD below signal - bearish momentum'
        });
      }
    }

    // Stochastic Oscillator Analysis
    const stoch = TechnicalIndicators.calculateStochastic(allCandles);
    if (stoch !== null) {
      if (stoch > 80) {
        indicators.push({
          name: 'Stochastic Overbought',
          type: 'bearish',
          strength: 'weak',
          description: `Stochastic: ${stoch.toFixed(1)} - Overbought zone`
        });
      } else if (stoch < 20) {
        indicators.push({
          name: 'Stochastic Oversold',
          type: 'bullish',
          strength: 'weak',
          description: `Stochastic: ${stoch.toFixed(1)} - Oversold zone`
        });
      }
    }

    // Moving Average Analysis
    const closes = allCandles.map(c => parseFloat(c.c));
    const sma20 = TechnicalIndicators.calculateSMA(closes, 20);
    const sma50 = TechnicalIndicators.calculateSMA(closes, 50);
    const ema12 = TechnicalIndicators.calculateEMA(closes, 12);
    const ema26 = TechnicalIndicators.calculateEMA(closes, 26);
    const currentPrice = parseFloat(allCandles[allCandles.length - 1].c);

    if (sma20 && sma50) {
      // Golden Cross / Death Cross
      if (sma20 > sma50 && currentPrice > sma20) {
        indicators.push({
          name: 'MA Golden Cross',
          type: 'bullish',
          strength: 'strong',
          description: 'Price above MAs - strong uptrend'
        });
      } else if (sma20 < sma50 && currentPrice < sma20) {
        indicators.push({
          name: 'MA Death Cross',
          type: 'bearish',
          strength: 'strong',
          description: 'Price below MAs - strong downtrend'
        });
      }
    }

    if (ema12 && ema26) {
      if (ema12 > ema26) {
        indicators.push({
          name: 'EMA Bullish',
          type: 'bullish',
          strength: 'weak',
          description: 'Fast EMA above slow EMA - bullish trend'
        });
      } else {
        indicators.push({
          name: 'EMA Bearish',
          type: 'bearish',
          strength: 'weak',
          description: 'Fast EMA below slow EMA - bearish trend'
        });
      }
    }

    return indicators;
  }

  static generateDecision(patterns, candle, allCandles) {
    if (!patterns || patterns.length === 0) {
      return {
        action: 'WAIT',
        confidence: 'none',
        entry: null,
        stopLoss: null,
        target1: null,
        target2: null,
        riskReward: null,
        reasoning: ['No clear pattern detected', 'Wait for setup']
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

    // Count indicator confirmations
    const bullishIndicators = patterns.filter(p => p.type === 'bullish').length;
    const bearishIndicators = patterns.filter(p => p.type === 'bearish').length;
    const hasIndicatorConfirm = Math.abs(bullishIndicators - bearishIndicators) >= 2;

    // Check for specific technical confirmations
    const rsiConfirm = patterns.some(p => p.name.includes('RSI') && (p.name.includes('Oversold') || p.name.includes('Overbought')));
    const macdConfirm = patterns.some(p => p.name.includes('MACD'));
    const maConfirm = patterns.some(p => p.name.includes('MA ') || p.name.includes('EMA'));

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
      indicators: {
        rsi: TechnicalIndicators.calculateRSI(allCandles),
        stochastic: TechnicalIndicators.calculateStochastic(allCandles),
        bullishSignals: bullishIndicators,
        bearishSignals: bearishIndicators
      }
    };

    if (strongBullish || (mediumBullish && hasVolumeConfirm) || (mediumBullish && hasIndicatorConfirm)) {
      const entry = high + (range * 0.01);
      const stopLoss = low - (range * 0.15);
      const risk = entry - stopLoss;
      const target1 = entry + risk * 1.5;
      const target2 = entry + risk * 2.5;
      const target3 = entry + risk * 4;

      // Calculate confidence based on multiple factors
      let confidence = 'low';
      if (strongBullish && hasVolumeConfirm && (rsiConfirm || macdConfirm)) {
        confidence = 'high';
      } else if (strongBullish && (hasVolumeConfirm || hasIndicatorConfirm)) {
        confidence = 'medium';
      } else if (strongBullish || (mediumBullish && hasIndicatorConfirm)) {
        confidence = 'medium';
      }

      const reasoning = [
        patterns.find(p => p.type === 'bullish')?.description || 'Bullish pattern detected',
        hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
      ];

      if (rsiConfirm) reasoning.push('✓ RSI confirms reversal/momentum');
      if (macdConfirm) reasoning.push('✓ MACD shows bullish momentum');
      if (maConfirm) reasoning.push('✓ Moving averages confirm trend');

      reasoning.push(`📊 ${bullishIndicators} bullish vs ${bearishIndicators} bearish signals`);
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
        indicators: {
          rsi: TechnicalIndicators.calculateRSI(allCandles),
          stochastic: TechnicalIndicators.calculateStochastic(allCandles),
          bullishSignals: bullishIndicators,
          bearishSignals: bearishIndicators
        }
      };
    } else if (strongBearish || (mediumBearish && hasVolumeConfirm) || (mediumBearish && hasIndicatorConfirm)) {
      const entry = low - (range * 0.01);
      const stopLoss = high + (range * 0.15);
      const risk = stopLoss - entry;
      const target1 = entry - risk * 1.5;
      const target2 = entry - risk * 2.5;
      const target3 = entry - risk * 4;

      // Calculate confidence based on multiple factors
      let confidence = 'low';
      if (strongBearish && hasVolumeConfirm && (rsiConfirm || macdConfirm)) {
        confidence = 'high';
      } else if (strongBearish && (hasVolumeConfirm || hasIndicatorConfirm)) {
        confidence = 'medium';
      } else if (strongBearish || (mediumBearish && hasIndicatorConfirm)) {
        confidence = 'medium';
      }

      const reasoning = [
        patterns.find(p => p.type === 'bearish')?.description || 'Bearish pattern detected',
        hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
      ];

      if (rsiConfirm) reasoning.push('✓ RSI confirms reversal/momentum');
      if (macdConfirm) reasoning.push('✓ MACD shows bearish momentum');
      if (maConfirm) reasoning.push('✓ Moving averages confirm trend');

      reasoning.push(`📊 ${bullishIndicators} bullish vs ${bearishIndicators} bearish signals`);
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
        indicators: {
          rsi: TechnicalIndicators.calculateRSI(allCandles),
          stochastic: TechnicalIndicators.calculateStochastic(allCandles),
          bullishSignals: bullishIndicators,
          bearishSignals: bearishIndicators
        }
      };
    } else {
      decision.reasoning = [
        'Pattern detected but not strong enough',
        'Wait for confirmation or stronger setup'
      ];
    }

    return decision;
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
      decision: dataStore.decisions[key]
    });
  } else {
    const candles = await fetchHistoricalCandles(instrument, timeframe);
    res.json({ candles, patterns: [], decision: null });
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
