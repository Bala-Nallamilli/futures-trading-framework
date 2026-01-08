import React, { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { CandlestickChart } from './components/CandlestickChart';
import { DecisionPanel } from './components/DecisionPanel';
import { TickerBar } from './components/TickerBar';
import { TradingRules } from './components/TradingRules';

function App() {
  const [selectedInstrument, setSelectedInstrument] = useState('BTC_USDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [hoveredCandle, setHoveredCandle] = useState(null);

  const {
    isConnected,
    tickers,
    candles,
    patterns,
    decisions,
    lastUpdate,
    subscribe
  } = useWebSocket();

  // Subscribe to selected instrument/timeframe
  useEffect(() => {
    if (isConnected) {
      subscribe(selectedInstrument, selectedTimeframe);
    }
  }, [isConnected, selectedInstrument, selectedTimeframe, subscribe]);

  const currentKey = `${selectedInstrument}_${selectedTimeframe}`;
  const currentCandles = candles[currentKey] || [];
  const currentPatterns = patterns[currentKey] || [];
  const currentDecision = decisions[currentKey];
  const currentTicker = tickers[selectedInstrument] || {};

  const timeframes = [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1H' },
    { value: '4h', label: '4H' },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-dark-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Trading Decision Framework</h1>
                <p className="text-gray-500 text-sm">Real-Time Pattern Recognition • Futures</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                isConnected ? 'bg-emerald-500/20' : 'bg-red-500/20'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                }`} />
                <span className={`text-sm ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isConnected ? 'LIVE' : 'DISCONNECTED'}
                </span>
              </div>

              {/* Last Update */}
              {lastUpdate && (
                <div className="text-xs text-gray-500">
                  Updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Ticker Bar */}
        <div className="mb-6">
          <TickerBar
            tickers={tickers}
            selectedInstrument={selectedInstrument}
            onSelect={setSelectedInstrument}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Section */}
          <div className="lg:col-span-2">
            <div className="bg-dark-800 rounded-xl border border-gray-800 p-4">
              {/* Chart Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-gray-300">
                    {selectedInstrument.replace('_', '/')}
                  </h2>
                  <span className={`text-lg font-bold ${
                    (currentTicker.change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {currentTicker.price 
                      ? (selectedInstrument.includes('BTC') 
                          ? `$${(currentTicker.price / 1000).toFixed(2)}K`
                          : selectedInstrument.includes('SUI')
                            ? `$${currentTicker.price.toFixed(4)}`
                            : `$${currentTicker.price.toFixed(2)}`)
                      : '-'
                    }
                  </span>
                  {currentTicker.change !== undefined && (
                    <span className={`text-sm px-2 py-0.5 rounded ${
                      currentTicker.change >= 0 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {currentTicker.change >= 0 ? '+' : ''}{currentTicker.change?.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Timeframe Selector */}
                <div className="flex gap-1">
                  {timeframes.map(tf => (
                    <button
                      key={tf.value}
                      onClick={() => setSelectedTimeframe(tf.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedTimeframe === tf.value
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="overflow-x-auto">
                <CandlestickChart
                  candles={currentCandles}
                  patterns={currentPatterns}
                  decision={currentDecision}
                  instrument={selectedInstrument}
                  onCandleHover={setHoveredCandle}
                />
              </div>

              {/* Pattern Legend */}
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-gray-500">Pattern Indicators:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-gray-400">Bullish</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-gray-400">Bearish</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="text-gray-400">Neutral</span>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <div className="w-8 h-0.5 bg-emerald-500" style={{ borderStyle: 'dashed' }} />
                    <span className="text-gray-400">Entry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-red-500" style={{ borderStyle: 'dashed' }} />
                    <span className="text-gray-400">Stop Loss</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-blue-500" style={{ borderStyle: 'dashed' }} />
                    <span className="text-gray-400">Targets</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Patterns Display */}
            {currentPatterns && currentPatterns.length > 0 && (
              <div className="mt-4 bg-dark-800 rounded-xl border border-gray-800 p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">DETECTED PATTERNS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentPatterns.map((pattern, i) => (
                    <div 
                      key={i}
                      className={`p-3 rounded-lg border ${
                        pattern.type === 'bullish' 
                          ? 'bg-emerald-900/20 border-emerald-800' 
                          : pattern.type === 'bearish'
                            ? 'bg-red-900/20 border-red-800'
                            : 'bg-yellow-900/20 border-yellow-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${
                          pattern.type === 'bullish' ? 'text-emerald-400' :
                          pattern.type === 'bearish' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {pattern.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          pattern.strength === 'strong' 
                            ? 'bg-white/10 text-white' 
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {pattern.strength}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{pattern.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Decision Panel */}
          <div className="lg:col-span-1">
            <DecisionPanel
              decision={currentDecision}
              patterns={currentPatterns}
              instrument={selectedInstrument}
            />
          </div>
        </div>

        {/* Trading Rules */}
        <div className="mt-6">
          <TradingRules />
        </div>

        {/* Disclaimer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            ⚠️ This tool is for educational purposes only. Always do your own research. 
            Past patterns don't guarantee future results. Trade responsibly.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
