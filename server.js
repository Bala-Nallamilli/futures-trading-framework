/**
 * Trading Decision Framework - Backend Server
 *
 * Multi-Exchange Price Aggregation: Binance + Coinbase + Kraken
 * Performs pattern recognition and broadcasts decisions to clients
 */

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
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
    'SOLUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LTCUSDT'
  ],
  // Display names mapping
  INSTRUMENT_DISPLAY: {
    'BTCUSDT': 'BTC_USDT',
    'ETHUSDT': 'ETH_USDT',
    'BNBUSDT': 'BNB_USDT',
    'XRPUSDT': 'XRP_USDT',
    'ADAUSDT': 'ADA_USDT',
    'SOLUSDT': 'SOL_USDT',
    'DOGEUSDT': 'DOGE_USDT',
    'DOTUSDT': 'DOT_USDT',
    'MATICUSDT': 'MATIC_USDT',
    'LTCUSDT': 'LTC_USDT'
  },
  // Symbol mappings for each exchange
  COINBASE_SYMBOLS: {
    'BTC_USDT': 'BTC-USD',
    'ETH_USDT': 'ETH-USD',
    'SOL_USDT': 'SOL-USD',
    'DOGE_USDT': 'DOGE-USD',
    'DOT_USDT': 'DOT-USD',
    'MATIC_USDT': 'MATIC-USD',
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
    'MATIC_USDT': 'MATIC/USD',
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

    return patterns;
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

    let decision = {
      action: 'WAIT',
      confidence: 'low',
      entry: null,
      stopLoss: null,
      target1: null,
      target2: null,
      target3: null,
      riskReward: null,
      reasoning: []
    };

    if (strongBullish || (mediumBullish && hasVolumeConfirm)) {
      const entry = high + (range * 0.01);
      const stopLoss = low - (range * 0.15);
      const risk = entry - stopLoss;
      const target1 = entry + risk * 1.5;
      const target2 = entry + risk * 2.5;
      const target3 = entry + risk * 4;

      decision = {
        action: 'LONG',
        confidence: strongBullish && hasVolumeConfirm ? 'high' : strongBullish ? 'medium' : 'low',
        entry: parseFloat(entry.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        target1: parseFloat(target1.toFixed(2)),
        target2: parseFloat(target2.toFixed(2)),
        target3: parseFloat(target3.toFixed(2)),
        riskReward: '1:2.5',
        reasoning: [
          patterns.find(p => p.type === 'bullish')?.description || 'Bullish pattern detected',
          hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
          'Entry: Break above candle high',
          `Risk: ${((risk / entry) * 100).toFixed(2)}% to stop loss`
        ]
      };
    } else if (strongBearish || (mediumBearish && hasVolumeConfirm)) {
      const entry = low - (range * 0.01);
      const stopLoss = high + (range * 0.15);
      const risk = stopLoss - entry;
      const target1 = entry - risk * 1.5;
      const target2 = entry - risk * 2.5;
      const target3 = entry - risk * 4;

      decision = {
        action: 'SHORT',
        confidence: strongBearish && hasVolumeConfirm ? 'high' : strongBearish ? 'medium' : 'low',
        entry: parseFloat(entry.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        target1: parseFloat(target1.toFixed(2)),
        target2: parseFloat(target2.toFixed(2)),
        target3: parseFloat(target3.toFixed(2)),
        riskReward: '1:2.5',
        reasoning: [
          patterns.find(p => p.type === 'bearish')?.description || 'Bearish pattern detected',
          hasVolumeConfirm ? '✓ Volume confirms the move' : '⚠ Wait for volume confirmation',
          'Entry: Break below candle low',
          `Risk: ${((risk / entry) * 100).toFixed(2)}% to stop loss`
        ]
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
  console.log('📥 Fetching historical candle data...');

  for (const instrument of CONFIG.INSTRUMENTS) {
    for (const tf of CONFIG.TIMEFRAMES) {
      await fetchHistoricalCandles(instrument, tf);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('✅ Historical data loaded');
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
      }

      return candles;
    }
    return [];
  } catch (err) {
    console.error(`Error fetching historical data for ${instrument} ${timeframe}:`, err.message);
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
  wss.close();
  server.close();
  process.exit(0);
});
