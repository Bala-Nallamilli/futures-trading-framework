import React from 'react';

export function TickerBar({ tickers, selectedInstrument, onSelect }) {
  // Get all available instruments from the tickers object
  const instruments = Object.keys(tickers).filter(key => tickers[key]?.price > 0);

  const formatPrice = (price, instrument) => {
    if (!price) return '-';
    if (instrument.includes('BTC')) return `$${(price / 1000).toFixed(2)}K`;
    if (instrument.includes('SUI')) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatChange = (change) => {
    if (!change && change !== 0) return '-';
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(2)}%`;
  };

  const getCoinColor = (symbol) => {
    const colors = {
      'BTC': 'bg-orange-500/20 text-orange-400',
      'ETH': 'bg-blue-500/20 text-blue-400',
      'BNB': 'bg-yellow-500/20 text-yellow-400',
      'XRP': 'bg-slate-500/20 text-slate-400',
      'ADA': 'bg-blue-600/20 text-blue-400',
      'SOL': 'bg-purple-500/20 text-purple-400',
      'DOGE': 'bg-yellow-600/20 text-yellow-500',
      'DOT': 'bg-pink-500/20 text-pink-400',
      'POL': 'bg-purple-600/20 text-purple-500',
      'LTC': 'bg-gray-500/20 text-gray-400',
    };
    return colors[symbol] || 'bg-cyan-500/20 text-cyan-400';
  };

  return (
    <div className="flex gap-3 flex-wrap">
      {instruments.map(instrument => {
        const ticker = tickers[instrument] || {};
        const isSelected = selectedInstrument === instrument;
        const isPositive = (ticker.change || 0) >= 0;
        const symbol = instrument.replace('_USDT', '');

        return (
          <button
            key={instrument}
            onClick={() => onSelect(instrument)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isSelected
                ? 'bg-dark-700 border-2 border-blue-500 glow-blue'
                : 'bg-dark-800 border border-gray-800 hover:border-gray-700'
            }`}
          >
            {/* Coin Icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getCoinColor(symbol)}`}>
              {symbol.charAt(0)}
            </div>

            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{symbol}</span>
                <span className="text-xs text-gray-500">/USDT</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-white font-medium">
                  {formatPrice(ticker.price, instrument)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {formatChange(ticker.change)}
                </span>
              </div>
            </div>

            {/* Live indicator */}
            {ticker.price && (
              <div className={`w-2 h-2 rounded-full ${
                isPositive ? 'bg-emerald-500 animate-pulse-green' : 'bg-red-500 animate-pulse-red'
              }`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
