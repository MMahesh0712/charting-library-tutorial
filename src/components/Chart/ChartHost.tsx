import React, { forwardRef } from 'react';
import ChartComponent from './ChartComponent';
import TradingViewChart from './TradingViewChart';
import { getChartEngine } from '../../services/tradingViewConfig';

interface ChartHostProps extends Record<string, unknown> {
  chartEngine?: 'legacy' | 'tradingview';
  tradingViewLibraryPath?: string;
}

const ChartHost = forwardRef<any, ChartHostProps>(function ChartHost(props, ref) {
  const { chartEngine, tradingViewLibraryPath, ...restProps } = props;
  const engine = chartEngine || getChartEngine();

  if (engine === 'tradingview') {
    return <TradingViewChart ref={ref} libraryPath={tradingViewLibraryPath} {...(restProps as any)} />;
  }

  return <ChartComponent ref={ref} {...(restProps as any)} />;
});

export default ChartHost;
