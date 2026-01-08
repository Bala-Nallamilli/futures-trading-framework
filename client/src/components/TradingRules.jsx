import React from 'react';

export function TradingRules() {
  return (
    <div className="bg-dark-800 rounded-xl border border-gray-800 p-6">
      <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <span>📋</span> Trading Rules — Never Break These
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* DO */}
        <div className="space-y-2">
          <div className="text-emerald-400 font-medium text-sm flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">✓</span>
            DO
          </div>
          <ul className="text-xs text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Wait for pattern + confirmation candle
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Always set stop loss BEFORE entry
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Risk only 1-2% of capital per trade
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Take partial profits at TP1
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Move stop to breakeven after TP1
            </li>
          </ul>
        </div>

        {/* DON'T */}
        <div className="space-y-2">
          <div className="text-red-400 font-medium text-sm flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-xs">✗</span>
            DON'T
          </div>
          <ul className="text-xs text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              Enter without confirmation candle
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              Move stop loss against position
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              Revenge trade after a loss
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              Trade patterns in middle of range
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">•</span>
              Over-leverage (max 5-10x)
            </li>
          </ul>
        </div>

        {/* WAIT WHEN */}
        <div className="space-y-2">
          <div className="text-yellow-400 font-medium text-sm flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center text-xs">⏳</span>
            WAIT WHEN
          </div>
          <ul className="text-xs text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-yellow-500 mt-0.5">•</span>
              No clear pattern visible
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-500 mt-0.5">•</span>
              R:R ratio below 1:2
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-500 mt-0.5">•</span>
              High impact news incoming
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-500 mt-0.5">•</span>
              Market is choppy/sideways
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-500 mt-0.5">•</span>
              You're emotional or tired
            </li>
          </ul>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-xs text-gray-400">
              <span className="text-white font-medium">Win Rate Goal</span><br />
              40-50% with 1:2+ R:R
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-xs text-gray-400">
              <span className="text-white font-medium">Max Risk</span><br />
              2% per trade, 6% daily
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-xs text-gray-400">
              <span className="text-white font-medium">Best Timeframes</span><br />
              1H, 4H for swing trades
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">⚡</div>
            <div className="text-xs text-gray-400">
              <span className="text-white font-medium">Leverage</span><br />
              5-10x max for beginners
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
