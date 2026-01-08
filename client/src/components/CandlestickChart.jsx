import React, { useMemo, useState } from 'react';

export function CandlestickChart({ 
  candles = [], 
  patterns = [], 
  decision,
  instrument,
  onCandleHover
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Chart dimensions
  const width = 800;
  const height = 400;
  const padding = { top: 40, right: 100, bottom: 50, left: 70 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Process candle data
  const processedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    
    return candles.map(c => ({
      time: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v)
    }));
  }, [candles]);

  // Calculate price range
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (processedCandles.length === 0) {
      return { minPrice: 0, maxPrice: 100, priceRange: 100 };
    }
    
    const highs = processedCandles.map(c => c.high);
    const lows = processedCandles.map(c => c.low);
    const min = Math.min(...lows) * 0.999;
    const max = Math.max(...highs) * 1.001;
    
    return { 
      minPrice: min, 
      maxPrice: max, 
      priceRange: max - min 
    };
  }, [processedCandles]);

  // Calculate candle dimensions
  const candleWidth = Math.min(20, (innerWidth / Math.max(processedCandles.length, 1)) * 0.7);
  const gap = processedCandles.length > 0 
    ? (innerWidth - candleWidth * processedCandles.length) / (processedCandles.length + 1)
    : 0;

  // Price to Y coordinate
  const priceToY = (price) => {
    return padding.top + innerHeight - ((price - minPrice) / priceRange) * innerHeight;
  };

  // Format price based on instrument
  const formatPrice = (price) => {
    if (instrument?.includes('BTC')) return `$${(price / 1000).toFixed(2)}K`;
    if (instrument?.includes('SUI')) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (processedCandles.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p>Waiting for candle data...</p>
        </div>
      </div>
    );
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Background grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = padding.top + innerHeight * pct;
        const price = maxPrice - pct * priceRange;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="#1f1f2e"
              strokeWidth={1}
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              fill="#4a4a5a"
              fontSize="11"
              fontFamily="JetBrains Mono"
            >
              {formatPrice(price)}
            </text>
          </g>
        );
      })}

      {/* Decision lines */}
      {decision && decision.action !== 'WAIT' && (
        <>
          {/* Entry line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={priceToY(decision.entry)}
            y2={priceToY(decision.entry)}
            stroke="#22c55e"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
          <text
            x={width - padding.right + 5}
            y={priceToY(decision.entry) + 4}
            fill="#22c55e"
            fontSize="10"
            fontFamily="JetBrains Mono"
          >
            Entry {formatPrice(decision.entry)}
          </text>

          {/* Stop loss line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={priceToY(decision.stopLoss)}
            y2={priceToY(decision.stopLoss)}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
          <text
            x={width - padding.right + 5}
            y={priceToY(decision.stopLoss) + 4}
            fill="#ef4444"
            fontSize="10"
            fontFamily="JetBrains Mono"
          >
            Stop {formatPrice(decision.stopLoss)}
          </text>

          {/* Target 1 line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={priceToY(decision.target1)}
            y2={priceToY(decision.target1)}
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <text
            x={width - padding.right + 5}
            y={priceToY(decision.target1) + 4}
            fill="#3b82f6"
            fontSize="10"
            fontFamily="JetBrains Mono"
          >
            TP1 {formatPrice(decision.target1)}
          </text>

          {/* Target 2 line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={priceToY(decision.target2)}
            y2={priceToY(decision.target2)}
            stroke="#8b5cf6"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <text
            x={width - padding.right + 5}
            y={priceToY(decision.target2) + 4}
            fill="#8b5cf6"
            fontSize="10"
            fontFamily="JetBrains Mono"
          >
            TP2 {formatPrice(decision.target2)}
          </text>
        </>
      )}

      {/* Candles */}
      {processedCandles.map((candle, i) => {
        const x = padding.left + gap + i * (candleWidth + gap);
        const isBullish = candle.close >= candle.open;
        const bodyTop = priceToY(Math.max(candle.open, candle.close));
        const bodyBottom = priceToY(Math.min(candle.open, candle.close));
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        const isLatest = i === processedCandles.length - 1;
        const hasPattern = isLatest && patterns && patterns.length > 0;

        return (
          <g
            key={i}
            onMouseEnter={() => {
              setHoveredIndex(i);
              onCandleHover?.(candle, i);
            }}
            onMouseLeave={() => {
              setHoveredIndex(null);
              onCandleHover?.(null, null);
            }}
            className="cursor-pointer"
          >
            {/* Upper wick */}
            <line
              x1={x + candleWidth / 2}
              x2={x + candleWidth / 2}
              y1={priceToY(candle.high)}
              y2={bodyTop}
              stroke={isBullish ? '#22c55e' : '#ef4444'}
              strokeWidth={1.5}
            />
            
            {/* Lower wick */}
            <line
              x1={x + candleWidth / 2}
              x2={x + candleWidth / 2}
              y1={bodyBottom}
              y2={priceToY(candle.low)}
              stroke={isBullish ? '#22c55e' : '#ef4444'}
              strokeWidth={1.5}
            />
            
            {/* Body */}
            <rect
              x={x}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={isBullish ? '#22c55e' : '#ef4444'}
              stroke={isBullish ? '#16a34a' : '#dc2626'}
              strokeWidth={1}
              rx={2}
              opacity={hoveredIndex === i ? 1 : 0.85}
            />

            {/* Pattern indicator on latest candle */}
            {hasPattern && (
              <g>
                <circle
                  cx={x + candleWidth / 2}
                  cy={priceToY(candle.high) - 15}
                  r={6}
                  fill={
                    patterns[0].type === 'bullish' ? '#22c55e' :
                    patterns[0].type === 'bearish' ? '#ef4444' : '#fbbf24'
                  }
                  stroke="#0a0a0f"
                  strokeWidth={2}
                  className={patterns[0].strength === 'strong' ? 'animate-pulse' : ''}
                />
                
                {/* Signal badge */}
                {decision && decision.action !== 'WAIT' && (
                  <g>
                    <rect
                      x={x - 15}
                      y={decision.action === 'LONG' ? priceToY(candle.high) - 40 : priceToY(candle.low) + 20}
                      width={candleWidth + 30}
                      height={18}
                      fill={decision.action === 'LONG' ? '#22c55e' : '#ef4444'}
                      rx={4}
                    />
                    <text
                      x={x + candleWidth / 2}
                      y={decision.action === 'LONG' ? priceToY(candle.high) - 27 : priceToY(candle.low) + 33}
                      textAnchor="middle"
                      fill="white"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono"
                    >
                      {decision.action}
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* Time labels (every 5 candles) */}
            {i % 5 === 0 && (
              <text
                x={x + candleWidth / 2}
                y={height - 15}
                textAnchor="middle"
                fill="#4a4a5a"
                fontSize="9"
                fontFamily="JetBrains Mono"
              >
                {formatTime(candle.time)}
              </text>
            )}
          </g>
        );
      })}

      {/* Hover tooltip */}
      {hoveredIndex !== null && (
        <g>
          <rect
            x={padding.left + 10}
            y={padding.top + 10}
            width={200}
            height={100}
            fill="#14141f"
            stroke="#2a2a3e"
            strokeWidth={1}
            rx={8}
          />
          <text x={padding.left + 20} y={padding.top + 32} fill="#9ca3af" fontSize="11" fontFamily="JetBrains Mono">
            O: <tspan fill="white">{formatPrice(processedCandles[hoveredIndex].open)}</tspan>
          </text>
          <text x={padding.left + 20} y={padding.top + 50} fill="#22c55e" fontSize="11" fontFamily="JetBrains Mono">
            H: <tspan fill="white">{formatPrice(processedCandles[hoveredIndex].high)}</tspan>
          </text>
          <text x={padding.left + 20} y={padding.top + 68} fill="#ef4444" fontSize="11" fontFamily="JetBrains Mono">
            L: <tspan fill="white">{formatPrice(processedCandles[hoveredIndex].low)}</tspan>
          </text>
          <text x={padding.left + 20} y={padding.top + 86} fill="#9ca3af" fontSize="11" fontFamily="JetBrains Mono">
            C: <tspan fill="white">{formatPrice(processedCandles[hoveredIndex].close)}</tspan>
          </text>
          <text x={padding.left + 110} y={padding.top + 50} fill="#9ca3af" fontSize="11" fontFamily="JetBrains Mono">
            Vol: <tspan fill="white">{processedCandles[hoveredIndex].volume.toFixed(2)}</tspan>
          </text>
        </g>
      )}
    </svg>
  );
}
