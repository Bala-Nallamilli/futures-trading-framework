# Trading Decision Framework

Real-time cryptocurrency trading analysis platform with pattern recognition and trading signals.

![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Real-time Market Data** - Live price feeds from Binance WebSocket API
- **Pattern Recognition** - Automatic candlestick pattern detection
  - Doji, Hammer, Shooting Star
  - Engulfing patterns (Bullish/Bearish)
  - Morning Star, Evening Star
  - Marubozu and more
- **Trading Signals** - Entry, stop-loss, and target levels
- **Multiple Timeframes** - 1m, 5m, 15m, 1h, 4h
- **Top 10 Crypto Pairs** - BTC, ETH, BNB, XRP, ADA, SOL, DOGE, DOT, MATIC, LTC

## Screenshots

The dashboard displays:
- Real-time price tickers with 24h change
- Interactive candlestick charts
- Pattern detection alerts
- Trading decision panel with entry/exit levels

## Prerequisites

- **Node.js 14+** (v18+ recommended for full features)
- **npm** (comes with Node.js)

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd trading-framework
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
npm start
```

### 4. Open in browser

Navigate to: **http://localhost:3001**

## Project Structure

```
trading-framework/
├── server.js           # Backend server (Express + WebSocket)
├── package.json        # Dependencies and scripts
├── .gitignore          # Git ignore rules
├── README.md           # This file
└── client/
    └── dist/
        └── index.html  # Frontend dashboard
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /api/instruments` | List of supported trading pairs |
| `GET /api/tickers` | Current prices for all pairs |
| `GET /api/candles/:instrument/:timeframe` | Historical candle data |

### WebSocket

Connect to `ws://localhost:3001` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  // type: 'init', 'ticker', 'candle_update'
};
```

## Supported Trading Pairs

| Symbol | Name |
|--------|------|
| BTC_USDT | Bitcoin |
| ETH_USDT | Ethereum |
| BNB_USDT | Binance Coin |
| XRP_USDT | Ripple |
| ADA_USDT | Cardano |
| SOL_USDT | Solana |
| DOGE_USDT | Dogecoin |
| DOT_USDT | Polkadot |
| MATIC_USDT | Polygon |
| LTC_USDT | Litecoin |

## Pattern Recognition

The system detects the following candlestick patterns:

### Reversal Patterns
- **Hammer / Hanging Man** - Potential trend reversal
- **Shooting Star / Inverted Hammer** - Bearish/Bullish reversal signals
- **Engulfing Patterns** - Strong reversal indicators
- **Morning Star / Evening Star** - 3-candle reversal patterns

### Continuation Patterns
- **Marubozu** - Strong momentum candles
- **Doji** - Market indecision

### Confirmation
- **Volume Analysis** - High volume confirmation of moves

## Configuration

Edit `server.js` to customize:

```javascript
const CONFIG = {
  INSTRUMENTS: ['BTCUSDT', 'ETHUSDT', ...],  // Trading pairs
  TIMEFRAMES: ['1m', '5m', '15m', '1h', '4h'], // Timeframes
  RECONNECT_DELAY: 5000,                       // WebSocket reconnect delay
};
```

## Troubleshooting

### Port already in use

```bash
npx kill-port 3001
npm start
```

### Connection issues

- Check your internet connection
- Binance API may be blocked in some regions
- Try using a VPN if needed

### Node.js version issues

If you see `Unexpected token '??='` error:
- Upgrade Node.js to v18+ from https://nodejs.org

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Vanilla JS, Lightweight Charts
- **Data Source**: Binance Public API

## Disclaimer

This tool is for educational and informational purposes only. It is NOT financial advice. Trading cryptocurrencies involves substantial risk of loss. Always do your own research and never trade with money you cannot afford to lose.

## License

MIT License - feel free to use and modify for your own projects.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
