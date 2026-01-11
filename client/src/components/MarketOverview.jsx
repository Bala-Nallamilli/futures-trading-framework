import React from 'react';

export function MarketOverview({ tickers, selectedInstrument, onSelect }) {
  // Get all instruments sorted by market cap/volume
  const instruments = Object.keys(tickers).sort();

  const formatPrice = (price, instrument) => {
    if (!price) return '-';
    if (instrument.includes('BTC')) return `$${(price / 1000).toFixed(2)}K`;
    return `$${price.toFixed(2)}`;
  };

  const formatVolume = (volume) => {
    if (!volume) return '-';
    if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(2)}B`;
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
    if (volume >= 1_000) return `$${(volume / 1_000).toFixed(2)}K`;
    return `$${volume.toFixed(2)}`;
  };

  const getCoinColor = (symbol) => {
    const colors = {
      'BTC': 'text-orange-400',
      'ETH': 'text-blue-400',
      'BNB': 'text-yellow-400',
      'XRP': 'text-slate-400',
      'ADA': 'text-blue-400',
      'SOL': 'text-purple-400',
      'DOGE': 'text-yellow-500',
      'DOT': 'text-pink-400',
      'POL': 'text-purple-500',
      'LTC': 'text-gray-400',
    };
    return colors[symbol] || 'text-cyan-400';
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h3 className="font-semibold text-gray-300 flex items-center gap-2">
          <span>📊</span> Market Overview — All Trading Pairs
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 bg-dark-900/50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Pair</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">24h Change</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">24h High</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">24h Low</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Volume</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Sources</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((instrument) => {
              const ticker = tickers[instrument] || {};
              const symbol = instrument.replace('_USDT', '');
              const isSelected = selectedInstrument === instrument;
              const isPositive = (ticker.change || 0) >= 0;
              const hasData = ticker.price > 0;

              return (
                <tr
                  key={instrument}
                  onClick={() => hasData && onSelect(instrument)}
                  className={`border-b border-gray-800 transition-colors ${
                    hasData ? 'cursor-pointer hover:bg-dark-700/50' : 'opacity-50'
                  } ${
                    isSelected ? 'bg-blue-500/10' : ''
                  }`}
                >
                  {/* Pair */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${getCoinColor(symbol)}`}>
                        {symbol}
                      </span>
                      <span className="text-xs text-gray-600">/USDT</span>
                      {isSelected && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          Selected
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-3 px-4 text-right">
                    <span className="font-medium text-white">
                      {formatPrice(ticker.price, instrument)}
                    </span>
                  </td>

                  {/* 24h Change */}
                  <td className="py-3 px-4 text-right">
                    {ticker.change !== undefined ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
                        isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {isPositive ? '▲' : '▼'}
                        {Math.abs(ticker.change).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>

                  {/* 24h High */}
                  <td className="py-3 px-4 text-right text-sm text-gray-400">
                    {ticker.high24h ? formatPrice(ticker.high24h, instrument) : '-'}
                  </td>

                  {/* 24h Low */}
                  <td className="py-3 px-4 text-right text-sm text-gray-400">
                    {ticker.low24h ? formatPrice(ticker.low24h, instrument) : '-'}
                  </td>

                  {/* Volume */}
                  <td className="py-3 px-4 text-right text-sm text-gray-400">
                    {formatVolume(ticker.volume)}
                  </td>

                  {/* Sources */}
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      {ticker.sources && ticker.sources.length > 0 ? (
                        ticker.sources.map((source) => (
                          <span
                            key={source}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
                            title={source}
                          >
                            {source.charAt(0)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-600">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="p-4 border-t border-gray-800 bg-dark-900/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Pairs</div>
            <div className="text-lg font-semibold text-white">{instruments.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Gainers</div>
            <div className="text-lg font-semibold text-emerald-400">
              {instruments.filter(i => (tickers[i]?.change || 0) > 0).length}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Losers</div>
            <div className="text-lg font-semibold text-red-400">
              {instruments.filter(i => (tickers[i]?.change || 0) < 0).length}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Exchanges</div>
            <div className="text-lg font-semibold text-blue-400">3</div>
          </div>
        </div>
      </div>
    </div>
  );
}
