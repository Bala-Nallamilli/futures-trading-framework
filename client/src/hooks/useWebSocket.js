import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = import.meta.env.PROD 
  ? `wss://${window.location.host}` 
  : 'ws://localhost:3001';

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [tickers, setTickers] = useState({});
  const [candles, setCandles] = useState({});
  const [patterns, setPatterns] = useState({});
  const [decisions, setDecisions] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('🔌 Connecting to server...');
    wsRef.current = new WebSocket(WS_URL);

    wsRef.current.onopen = () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    wsRef.current.onclose = () => {
      console.log('🔌 Disconnected from server');
      setIsConnected(false);
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, []);

  const handleMessage = (message) => {
    const { type, data } = message;
    setLastUpdate(new Date());

    switch (type) {
      case 'init':
        setTickers(data.tickers || {});
        setCandles(data.candles || {});
        setPatterns(data.patterns || {});
        setDecisions(data.decisions || {});
        break;

      case 'ticker':
        setTickers(prev => ({
          ...prev,
          [data.instrument]: data
        }));
        break;

      case 'candle_update':
        const key = `${data.instrument}_${data.timeframe}`;
        
        if (data.allCandles) {
          setCandles(prev => ({
            ...prev,
            [key]: data.allCandles
          }));
        }
        
        if (data.patterns) {
          setPatterns(prev => ({
            ...prev,
            [key]: data.patterns
          }));
        }
        
        if (data.decision) {
          setDecisions(prev => ({
            ...prev,
            [key]: data.decision
          }));
        }
        break;

      case 'history':
        const histKey = `${data.instrument}_${data.timeframe}`;
        setCandles(prev => ({
          ...prev,
          [histKey]: data.candles
        }));
        break;
    }
  };

  const subscribe = useCallback((instrument, timeframe) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        instrument,
        timeframe
      }));
    }
  }, []);

  const getHistory = useCallback((instrument, timeframe) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'get_history',
        instrument,
        timeframe
      }));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    tickers,
    candles,
    patterns,
    decisions,
    lastUpdate,
    subscribe,
    getHistory
  };
}
