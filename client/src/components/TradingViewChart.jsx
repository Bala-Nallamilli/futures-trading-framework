import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';

export function TradingViewChart({
  candles = [],
  patterns = [],
  decision,
  instrument,
  onCandleHover
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const markersRef = useRef([]);
  const priceLinesRef = useRef([]);
  const [drawingMode, setDrawingMode] = useState(null); // 'trendline', 'horizontal', 'ray', 'fibonacci'
  const [drawings, setDrawings] = useState([]);
  const [drawingStart, setDrawingStart] = useState(null);
  const [tempLine, setTempLine] = useState(null);
  const drawingsSeriesRef = useRef([]);

  // Process candles for lightweight-charts format
  const processedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];

    return candles.map(c => ({
      time: Math.floor(new Date(c.t).getTime() / 1000),
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
    })).sort((a, b) => a.time - b.time);
  }, [candles]);

  // Process volume data
  const volumeData = useMemo(() => {
    if (!candles || candles.length === 0) return [];

    return candles.map(c => ({
      time: Math.floor(new Date(c.t).getTime() / 1000),
      value: parseFloat(c.v),
      color: parseFloat(c.c) >= parseFloat(c.o) ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    })).sort((a, b) => a.time - b.time);
  }, [candles]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: 'solid', color: '#0a0a0f' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#1f1f2e', style: LineStyle.Dotted },
        horzLines: { color: '#1f1f2e', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#4a4a5a',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2a2a4a',
        },
        horzLine: {
          color: '#4a4a5a',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2a2a4a',
        },
      },
      rightPriceScale: {
        borderColor: '#2a2a4a',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#2a2a4a',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 12,
        minBarSpacing: 5,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
    });

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Subscribe to crosshair move for hover info
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData && candleSeries) {
        const data = param.seriesData.get(candleSeries);
        if (data && onCandleHover) {
          onCandleHover({
            time: param.time * 1000,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
          }, null);
        }
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || processedCandles.length === 0) return;

    candleSeriesRef.current.setData(processedCandles);

    // Fit content after data update
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [processedCandles]);

  // Update volume data
  useEffect(() => {
    if (!volumeSeriesRef.current || volumeData.length === 0) return;
    volumeSeriesRef.current.setData(volumeData);
  }, [volumeData]);

  // Update decision price lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove old price lines
    priceLinesRef.current.forEach(line => {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch (e) {}
    });
    priceLinesRef.current = [];

    if (decision && decision.action !== 'WAIT') {
      // Entry line
      const entryLine = candleSeriesRef.current.createPriceLine({
        price: decision.entry,
        color: '#22c55e',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Entry',
      });
      priceLinesRef.current.push(entryLine);

      // Stop loss line
      const stopLine = candleSeriesRef.current.createPriceLine({
        price: decision.stopLoss,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Stop',
      });
      priceLinesRef.current.push(stopLine);

      // Target 1 line
      if (decision.target1) {
        const tp1Line = candleSeriesRef.current.createPriceLine({
          price: decision.target1,
          color: '#3b82f6',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP1',
        });
        priceLinesRef.current.push(tp1Line);
      }

      // Target 2 line
      if (decision.target2) {
        const tp2Line = candleSeriesRef.current.createPriceLine({
          price: decision.target2,
          color: '#8b5cf6',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP2',
        });
        priceLinesRef.current.push(tp2Line);
      }

      // Target 3 line
      if (decision.target3) {
        const tp3Line = candleSeriesRef.current.createPriceLine({
          price: decision.target3,
          color: '#ec4899',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP3',
        });
        priceLinesRef.current.push(tp3Line);
      }
    }
  }, [decision]);

  // Update markers for patterns
  useEffect(() => {
    if (!candleSeriesRef.current || processedCandles.length === 0) return;

    const markers = [];

    // Add pattern markers on latest candle
    if (patterns && patterns.length > 0) {
      const latestCandle = processedCandles[processedCandles.length - 1];

      patterns.forEach((pattern, i) => {
        markers.push({
          time: latestCandle.time,
          position: pattern.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: pattern.type === 'bullish' ? '#22c55e' :
                 pattern.type === 'bearish' ? '#ef4444' : '#fbbf24',
          shape: pattern.type === 'bullish' ? 'arrowUp' :
                 pattern.type === 'bearish' ? 'arrowDown' : 'circle',
          text: pattern.name,
        });
      });
    }

    // Add signal marker
    if (decision && decision.action !== 'WAIT' && processedCandles.length > 0) {
      const latestCandle = processedCandles[processedCandles.length - 1];
      markers.push({
        time: latestCandle.time,
        position: decision.action === 'LONG' ? 'belowBar' : 'aboveBar',
        color: decision.action === 'LONG' ? '#22c55e' : '#ef4444',
        shape: decision.action === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: decision.action,
        size: 2,
      });
    }

    candleSeriesRef.current.setMarkers(markers);
    markersRef.current = markers;
  }, [patterns, decision, processedCandles]);

  // Handle drawing mode click
  const handleChartClick = useCallback((param) => {
    if (!drawingMode || !chartRef.current || !candleSeriesRef.current) return;

    const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
    const time = chartRef.current.timeScale().coordinateToTime(param.point.x);

    if (!time || !price) return;

    if (drawingMode === 'horizontal') {
      // Add horizontal line
      const line = candleSeriesRef.current.createPriceLine({
        price: price,
        color: '#fbbf24',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `H ${price.toFixed(2)}`,
      });
      setDrawings(prev => [...prev, { type: 'horizontal', line, price }]);
      setDrawingMode(null);
    } else if (drawingMode === 'trendline' || drawingMode === 'ray') {
      if (!drawingStart) {
        // First point
        setDrawingStart({ time, price, x: param.point.x, y: param.point.y });
      } else {
        // Second point - create line
        const lineSeries = chartRef.current.addLineSeries({
          color: drawingMode === 'trendline' ? '#fbbf24' : '#06b6d4',
          lineWidth: 2,
          lineStyle: drawingMode === 'ray' ? LineStyle.Dashed : LineStyle.Solid,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });

        // For rays, extend the line further
        let endTime = time;
        let endPrice = price;

        if (drawingMode === 'ray') {
          // Calculate slope and extend
          const timeDiff = time - drawingStart.time;
          const priceDiff = price - drawingStart.price;
          const slope = priceDiff / timeDiff;

          // Extend by 50 more time units
          endTime = time + (timeDiff * 2);
          endPrice = price + (priceDiff * 2);
        }

        lineSeries.setData([
          { time: drawingStart.time, value: drawingStart.price },
          { time: endTime, value: endPrice },
        ]);

        setDrawings(prev => [...prev, {
          type: drawingMode,
          series: lineSeries,
          start: drawingStart,
          end: { time, price }
        }]);
        drawingsSeriesRef.current.push(lineSeries);
        setDrawingStart(null);
        setDrawingMode(null);
        setTempLine(null);
      }
    } else if (drawingMode === 'fibonacci') {
      if (!drawingStart) {
        setDrawingStart({ time, price });
      } else {
        // Create Fibonacci retracement levels
        const startPrice = drawingStart.price;
        const endPrice = price;
        const diff = endPrice - startPrice;

        const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const fibColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ef4444'];

        fibLevels.forEach((level, i) => {
          const fibPrice = startPrice + (diff * level);
          const line = candleSeriesRef.current.createPriceLine({
            price: fibPrice,
            color: fibColors[i],
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `${(level * 100).toFixed(1)}%`,
          });
          setDrawings(prev => [...prev, { type: 'fibonacci', line, price: fibPrice, level }]);
        });

        setDrawingStart(null);
        setDrawingMode(null);
      }
    }
  }, [drawingMode, drawingStart]);

  // Subscribe to chart clicks for drawing
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.subscribeClick(handleChartClick);

    return () => {
      if (chartRef.current) {
        chartRef.current.unsubscribeClick(handleChartClick);
      }
    };
  }, [handleChartClick]);

  // Clear all drawings
  const clearDrawings = useCallback(() => {
    // Remove price lines
    drawings.forEach(d => {
      if (d.line && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(d.line);
        } catch (e) {}
      }
    });

    // Remove line series
    drawingsSeriesRef.current.forEach(series => {
      if (chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {}
      }
    });

    drawingsSeriesRef.current = [];
    setDrawings([]);
    setDrawingStart(null);
    setTempLine(null);
  }, [drawings]);

  // Undo last drawing
  const undoDrawing = useCallback(() => {
    if (drawings.length === 0) return;

    const lastDrawing = drawings[drawings.length - 1];

    if (lastDrawing.line && candleSeriesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(lastDrawing.line);
      } catch (e) {}
    }

    if (lastDrawing.series && chartRef.current) {
      try {
        chartRef.current.removeSeries(lastDrawing.series);
        const idx = drawingsSeriesRef.current.indexOf(lastDrawing.series);
        if (idx > -1) drawingsSeriesRef.current.splice(idx, 1);
      } catch (e) {}
    }

    setDrawings(prev => prev.slice(0, -1));
  }, [drawings]);

  // Drawing tools toolbar
  const DrawingToolbar = () => (
    <div className="flex items-center gap-2 mb-3 p-2 bg-dark-800 rounded-lg border border-gray-700">
      <span className="text-xs text-gray-500 mr-2">Draw:</span>

      <button
        onClick={() => setDrawingMode(drawingMode === 'horizontal' ? null : 'horizontal')}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
          drawingMode === 'horizontal'
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-transparent'
        }`}
        title="Horizontal Line"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
          Horizontal
        </span>
      </button>

      <button
        onClick={() => setDrawingMode(drawingMode === 'trendline' ? null : 'trendline')}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
          drawingMode === 'trendline'
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-transparent'
        }`}
        title="Trendline"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="18" x2="21" y2="6" />
          </svg>
          Trendline
        </span>
      </button>

      <button
        onClick={() => setDrawingMode(drawingMode === 'ray' ? null : 'ray')}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
          drawingMode === 'ray'
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-transparent'
        }`}
        title="Ray"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="18" x2="21" y2="6" strokeDasharray="4 2" />
            <circle cx="21" cy="6" r="2" fill="currentColor" />
          </svg>
          Ray
        </span>
      </button>

      <button
        onClick={() => setDrawingMode(drawingMode === 'fibonacci' ? null : 'fibonacci')}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
          drawingMode === 'fibonacci'
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-transparent'
        }`}
        title="Fibonacci Retracement"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="4" x2="21" y2="4" />
            <line x1="3" y1="9" x2="21" y2="9" strokeOpacity="0.7" />
            <line x1="3" y1="14" x2="21" y2="14" strokeOpacity="0.5" />
            <line x1="3" y1="20" x2="21" y2="20" strokeOpacity="0.3" />
          </svg>
          Fib
        </span>
      </button>

      <div className="w-px h-6 bg-gray-700 mx-2" />

      <button
        onClick={undoDrawing}
        disabled={drawings.length === 0}
        className="px-3 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
        title="Undo (Ctrl+Z)"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10h10a5 5 0 0 1 5 5v2" />
            <polyline points="7,14 3,10 7,6" />
          </svg>
          Undo
        </span>
      </button>

      <button
        onClick={clearDrawings}
        disabled={drawings.length === 0}
        className="px-3 py-1.5 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
        title="Clear All"
      >
        <span className="inline-flex items-center gap-1">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2,0 0,1-2-2V6m3,0V4a2,2,0 0,1,2-2h4a2,2,0 0,1,2,2v2" />
          </svg>
          Clear
        </span>
      </button>

      {drawingMode && (
        <span className="ml-2 text-xs text-gray-400">
          {drawingStart
            ? 'Click second point...'
            : drawingMode === 'horizontal'
              ? 'Click to place line'
              : 'Click first point...'
          }
        </span>
      )}

      {drawings.length > 0 && (
        <span className="ml-auto text-xs text-gray-500">
          {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Z for undo
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undoDrawing();
      }
      // Escape to cancel drawing
      if (e.key === 'Escape') {
        setDrawingMode(null);
        setDrawingStart(null);
      }
      // H for horizontal
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
        setDrawingMode('horizontal');
      }
      // T for trendline
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
        setDrawingMode('trendline');
      }
      // R for ray
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        setDrawingMode('ray');
      }
      // F for fibonacci
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        setDrawingMode('fibonacci');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoDrawing]);

  return (
    <div className="relative">
      <DrawingToolbar />
      <div
        ref={chartContainerRef}
        className={`w-full ${drawingMode ? 'cursor-crosshair' : ''}`}
        style={{ minHeight: 500 }}
      />

      {/* Keyboard shortcuts hint */}
      <div className="mt-2 text-xs text-gray-600 flex items-center gap-4">
        <span>Shortcuts:</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">H</kbd> Horizontal</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">T</kbd> Trendline</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">R</kbd> Ray</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">F</kbd> Fibonacci</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">Esc</kbd> Cancel</span>
        <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">Ctrl+Z</kbd> Undo</span>
      </div>
    </div>
  );
}
