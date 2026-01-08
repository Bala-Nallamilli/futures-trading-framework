/**
 * Trading Decision Framework - Backend Server
 * 
 * Connects to Crypto.com WebSocket for real-time futures data
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

// Configuration - Using Binance public WebSocket (more reliable, no auth required)
const CONFIG = {
  // Binance public WebSocket for market data
  WS_URL: 'wss://stream.binance.com:9443/ws',
  // Top 10 crypto trading pairs
  INSTRUMENTS: [
    'BTCUSDT',   // Bitcoin
    'ETHUSDT',   // Ethereum
    'BNBUSDT',   // Binance Coin
    'XRPUSDT',   // Ripple
    'ADAUSDT',   // Cardano
    'SOLUSDT',   // Solana
    'DOGEUSDT',  // Dogecoin
    'DOTUSDT',   // Polkadot
    'MATICUSDT', // Polygon
    'LTCUSDT'    // Litecoin
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
  TIMEFRAMES: ['1m', '5m', '15m', '1h', '4h'],
  // Binance timeframe mapping
  TIMEFRAME_MAP: {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h'
  },
  RECONNECT_DELAY: 5000,
  MAX_RECONNECT_ATTEMPTS: 10,
};

// Store for candle data and patterns
const dataStore = {
  candles: {},      // { 'BTC_USDT_1h': [...candles] }
  patterns: {},     // { 'BTC_USDT_1h': [...patterns] }
  decisions: {},    // { 'BTC_USDT_1h': decision }
  tickers: {},      // { 'BTC_USDT': { price, change, volume } }
};

// Initialize data store using display names
CONFIG.INSTRUMENTS.forEach(instrument => {
  const displayName = CONFIG.INSTRUMENT_DISPLAY[instrument];
  CONFIG.TIMEFRAMES.forEach(tf => {
    const key = `${displayName}_${tf}`;
    dataStore.candles[key] = [];
    dataStore.patterns[key] = [];
    dataStore.decisions[key] = null;
  });
  dataStore.tickers[displayName] = { price: 0, change: 0, volume: 0 };
});

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
      const candle3 = candle;
      
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
      const candle3 = candle;
      
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

    const open = parseFloat(candle.o);
    const high = parseFloat(candle.h);
    const low = parseFloat(candle.l);
    const close = parseFloat(candle.c);
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

let exchangeWs = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;

function buildStreamUrl() {
  // Build combined stream URL for all instruments and timeframes
  const streams = [];

  CONFIG.INSTRUMENTS.forEach(instrument => {
    const symbol = instrument.toLowerCase();
    // Add ticker stream
    streams.push(`${symbol}@ticker`);
    // Add kline streams for each timeframe
    CONFIG.TIMEFRAMES.forEach(tf => {
      streams.push(`${symbol}@kline_${tf}`);
    });
  });

  return `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
}

function connectToExchange() {
  console.log('🔌 Connecting to Binance WebSocket...');

  const streamUrl = buildStreamUrl();
  exchangeWs = new WebSocket(streamUrl);

  exchangeWs.on('open', () => {
    console.log('✅ Connected to Binance');
    console.log('📊 Subscribed to all instruments and timeframes');
    reconnectAttempts = 0;

    // Fetch initial historical data for all instruments/timeframes
    fetchAllHistoricalData();
  });

  exchangeWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleExchangeMessage(message);
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  exchangeWs.on('error', (error) => {
    console.error('❌ Binance WebSocket error:', error.message);
  });

  exchangeWs.on('close', () => {
    console.log('🔌 Binance connection closed. Reconnecting...');
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectAttempts++;

  if (reconnectAttempts > CONFIG.MAX_RECONNECT_ATTEMPTS) {
    console.error('❌ Max reconnection attempts reached. Please check your network connection.');
    return;
  }

  const delay = CONFIG.RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
  console.log(`⏳ Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})...`);
  reconnectTimeout = setTimeout(connectToExchange, delay);
}

async function fetchAllHistoricalData() {
  console.log('📥 Fetching historical candle data...');

  for (const instrument of CONFIG.INSTRUMENTS) {
    for (const tf of CONFIG.TIMEFRAMES) {
      await fetchHistoricalCandles(instrument, tf);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('✅ Historical data loaded');
}

function handleExchangeMessage(message) {
  if (!message.stream || !message.data) return;

  const stream = message.stream;
  const data = message.data;

  // Handle ticker updates (e.g., btcusdt@ticker)
  if (stream.endsWith('@ticker')) {
    const symbol = data.s; // e.g., 'BTCUSDT'
    const displayName = CONFIG.INSTRUMENT_DISPLAY[symbol];

    if (displayName && dataStore.tickers[displayName]) {
      dataStore.tickers[displayName] = {
        price: parseFloat(data.c) || 0, // Current price
        high24h: parseFloat(data.h) || 0,
        low24h: parseFloat(data.l) || 0,
        volume: parseFloat(data.v) || 0,
        change: parseFloat(data.P) || 0, // 24h change percentage
        timestamp: data.E
      };
      broadcastToClients('ticker', { instrument: displayName, ...dataStore.tickers[displayName] });
    }
  }

  // Handle kline/candlestick updates (e.g., btcusdt@kline_1h)
  if (stream.includes('@kline_')) {
    const symbol = data.s; // e.g., 'BTCUSDT'
    const displayName = CONFIG.INSTRUMENT_DISPLAY[symbol];
    const kline = data.k;
    const timeframe = kline.i; // e.g., '1h'
    const key = `${displayName}_${timeframe}`;

    if (displayName && dataStore.candles[key] !== undefined) {
      // Convert Binance kline format to our candle format
      const candle = {
        t: kline.t, // Open time
        o: kline.o, // Open
        h: kline.h, // High
        l: kline.l, // Low
        c: kline.c, // Close
        v: kline.v, // Volume
        T: kline.T, // Close time
        isClosed: kline.x // Is this kline closed?
      };

      const existingIndex = dataStore.candles[key].findIndex(c => c.t === candle.t);

      if (existingIndex >= 0) {
        // Update existing candle
        dataStore.candles[key][existingIndex] = candle;
      } else {
        // Add new candle
        dataStore.candles[key].push(candle);
        // Keep last 100 candles
        if (dataStore.candles[key].length > 100) {
          dataStore.candles[key].shift();
        }
      }

      // Sort by timestamp
      dataStore.candles[key].sort((a, b) => a.t - b.t);

      // Analyze patterns on latest candles
      const allCandles = dataStore.candles[key];
      if (allCandles.length >= 3) {
        const latestCandle = allCandles[allCandles.length - 1];
        const patterns = PatternRecognizer.analyzeCandle(
          latestCandle,
          allCandles.length - 1,
          allCandles
        );

        dataStore.patterns[key] = patterns;

        const decision = PatternRecognizer.generateDecision(
          patterns,
          latestCandle,
          allCandles
        );
        dataStore.decisions[key] = decision;

        // Broadcast update
        broadcastToClients('candle_update', {
          instrument: displayName,
          timeframe,
          candle: latestCandle,
          patterns,
          decision,
          allCandles: allCandles.slice(-50) // Send last 50 candles
        });
      }
    }
  }
}

// =============================================================================
// CLIENT WEBSOCKET HANDLING
// =============================================================================

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  clients.add(ws);

  // Send current state to new client
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
      // Client wants specific instrument/timeframe
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
      
    case 'get_history':
      // Fetch historical data via REST
      fetchHistoricalCandles(data.instrument, data.timeframe)
        .then(candles => {
          ws.send(JSON.stringify({
            type: 'history',
            data: { instrument: data.instrument, timeframe: data.timeframe, candles }
          }));
        });
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

// Helper function to make HTTPS GET requests (compatible with Node.js 14)
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

async function fetchHistoricalCandles(instrument, timeframe) {
  try {
    const displayName = CONFIG.INSTRUMENT_DISPLAY[instrument];
    const key = `${displayName}_${timeframe}`;

    const url = `https://api.binance.com/api/v3/klines?symbol=${instrument}&interval=${timeframe}&limit=100`;
    const data = await httpsGet(url);

    if (Array.isArray(data)) {
      // Convert Binance kline array format to our candle format
      const candles = data.map(k => ({
        t: k[0],    // Open time
        o: k[1],    // Open
        h: k[2],    // High
        l: k[3],    // Low
        c: k[4],    // Close
        v: k[5],    // Volume
        T: k[6],    // Close time
        isClosed: true
      }));

      // Store in dataStore
      if (dataStore.candles[key] !== undefined) {
        dataStore.candles[key] = candles;

        // Analyze patterns for the latest candle
        if (candles.length >= 3) {
          const latestCandle = candles[candles.length - 1];
          const patterns = PatternRecognizer.analyzeCandle(
            latestCandle,
            candles.length - 1,
            candles
          );
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
  // Return display names (BTC_USDT format)
  res.json(Object.values(CONFIG.INSTRUMENT_DISPLAY));
});

app.get('/api/candles/:instrument/:timeframe', async (req, res) => {
  const { instrument, timeframe } = req.params;
  const key = `${instrument}_${timeframe}`;
  
  // Return cached data or fetch fresh
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
    exchangeConnected: exchangeWs?.readyState === WebSocket.OPEN,
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
║  Data Source:  Binance Public API                             ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Connect to Binance
  connectToExchange();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (exchangeWs) exchangeWs.close();
  wss.close();
  server.close();
  process.exit(0);
});
