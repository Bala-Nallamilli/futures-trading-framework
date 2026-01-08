import React from 'react';

export function TickerBar({ tickers, selectedInstrument, onSelect }) {
  const instruments = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'SUI_USDT'];

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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              symbol === 'BTC' ? 'bg-orange-500/20 text-orange-400' :
              symbol === 'ETH' ? 'bg-blue-500/20 text-blue-400' :
              symbol === 'SOL' ? 'bg-purple-500/20 text-purple-400' :
              'bg-cyan-500/20 text-cyan-400'
            }`}>
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
