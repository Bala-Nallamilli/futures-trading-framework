import React from 'react';

export function DecisionPanel({ decision, patterns, instrument }) {
  if (!decision) {
    return (
      <div className="bg-dark-800 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">SIGNAL</h3>
        <div className="text-center py-8">
          <div className="text-4xl mb-2">⏳</div>
          <p className="text-gray-500">Waiting for data...</p>
        </div>
      </div>
    );
  }

  const isLong = decision.action === 'LONG';
  const isShort = decision.action === 'SHORT';
  const isWait = decision.action === 'WAIT';

  const formatPrice = (price) => {
    if (!price) return '-';
    if (instrument?.includes('BTC')) return `$${(price / 1000).toFixed(2)}K`;
    if (instrument?.includes('SUI')) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  // Calculate risk metrics
  const riskPercent = decision.entry && decision.stopLoss
    ? Math.abs((decision.entry - decision.stopLoss) / decision.entry * 100)
    : 0;
  const rewardPercent = decision.entry && decision.target1
    ? Math.abs((decision.target1 - decision.entry) / decision.entry * 100)
    : 0;
  const rrRatio = riskPercent > 0 ? rewardPercent / riskPercent : 0;

  return (
    <div className="space-y-4">
      {/* Main Signal */}
      <div className="bg-dark-800 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">LATEST SIGNAL</h3>
        
        {isWait ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700/50 mb-3">
              <span className="text-2xl">⏳</span>
              <span className="font-bold text-gray-400">WAIT</span>
            </div>
            <div className="text-gray-500 text-sm">
              {decision.reasoning?.map((r, i) => (
                <p key={i}>{r}</p>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Action Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-4 ${
              isLong 
                ? 'bg-emerald-500/20 glow-green' 
                : 'bg-red-500/20 glow-red'
            }`}>
              <span className={`text-2xl ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                {isLong ? '↗' : '↘'}
              </span>
              <span className={`text-xl font-bold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                {decision.action}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                decision.confidence === 'high' 
                  ? 'bg-emerald-600 text-white' 
                  : decision.confidence === 'medium'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-600 text-white'
              }`}>
                {decision.confidence?.toUpperCase()}
              </span>
            </div>

            {/* Pattern Info */}
            {patterns && patterns.length > 0 && (
              <div className="mb-4">
                <span className="text-gray-500 text-xs">PATTERN DETECTED</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {patterns.map((p, i) => (
                    <span 
                      key={i}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        p.type === 'bullish' ? 'bg-emerald-900/50 text-emerald-400' :
                        p.type === 'bearish' ? 'bg-red-900/50 text-red-400' :
                        'bg-yellow-900/50 text-yellow-400'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Price Levels */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-500">Entry</span>
                <span className="text-emerald-400 font-medium">{formatPrice(decision.entry)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-500">Stop Loss</span>
                <span className="text-red-400 font-medium">{formatPrice(decision.stopLoss)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-500">Target 1</span>
                <span className="text-blue-400 font-medium">{formatPrice(decision.target1)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-500">Target 2</span>
                <span className="text-purple-400 font-medium">{formatPrice(decision.target2)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">Target 3</span>
                <span className="text-pink-400 font-medium">{formatPrice(decision.target3)}</span>
              </div>
            </div>

            {/* Reasoning */}
            <div className="mt-4 pt-3 border-t border-gray-800">
              <span className="text-gray-500 text-xs">REASONING</span>
              <ul className="mt-2 space-y-1">
                {decision.reasoning?.map((r, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className={`mt-0.5 ${
                      r.startsWith('✓') ? 'text-emerald-500' : 
                      r.startsWith('⚠') ? 'text-yellow-500' : 'text-blue-500'
                    }`}>
                      {r.startsWith('✓') || r.startsWith('⚠') ? '' : '•'}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Risk Calculator */}
      {!isWait && (
        <div className="bg-dark-800 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">RISK CALCULATOR</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Risk</span>
              <span className="text-red-400">{riskPercent.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reward (TP1)</span>
              <span className="text-emerald-400">{rewardPercent.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">R:R Ratio</span>
              <span className={rrRatio >= 2 ? 'text-emerald-400' : 'text-yellow-400'}>
                1:{rrRatio.toFixed(1)}
              </span>
            </div>
            
            {/* Risk meter */}
            <div className="pt-2">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${rrRatio >= 2 ? 'bg-emerald-500' : rrRatio >= 1.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(rrRatio * 20, 100)}%` }}
                />
              </div>
            </div>
            
            <div className={`text-xs px-3 py-2 rounded-lg mt-2 ${
              rrRatio >= 2 
                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' 
                : rrRatio >= 1.5
                  ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
                  : 'bg-red-900/30 text-red-400 border border-red-800'
            }`}>
              {rrRatio >= 2 
                ? '✓ Good R:R ratio — Trade acceptable'
                : rrRatio >= 1.5
                  ? '⚠ Marginal R:R — Consider waiting'
                  : '✗ Poor R:R — Skip this trade'
              }
            </div>
          </div>
        </div>
      )}

      {/* Position Size Calculator */}
      {!isWait && (
        <div className="bg-dark-800 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">POSITION SIZE</h3>
          <p className="text-xs text-gray-500 mb-3">Based on 2% risk per trade</p>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">$1,000 Account</span>
              <span className="text-white">${(20 / (riskPercent / 100)).toFixed(0)} position</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">$5,000 Account</span>
              <span className="text-white">${(100 / (riskPercent / 100)).toFixed(0)} position</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">$10,000 Account</span>
              <span className="text-white">${(200 / (riskPercent / 100)).toFixed(0)} position</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
