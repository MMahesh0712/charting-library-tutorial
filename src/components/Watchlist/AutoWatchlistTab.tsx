/**
 * AutoWatchlistTab -- Active Markets Panel
 *
 * Click index card / header -> loads that index chart.
 * Click option row -> loads that option chart.
 * Trade signals (SP/BET) appear on option charts via the same overlay pipeline.
 */

import React, { useMemo } from 'react';
import { useAutoWatchlist } from '../../hooks/useAutoWatchlist';
import { RefreshCw, Zap, TrendingUp, Layers } from 'lucide-react';
import styles from './AutoWatchlistTab.module.css';
import { getUnderlyingAlias } from '../../utils/symbolNormalization';
import type { ActiveOption } from '../../types/domain/trades';

interface AutoWatchlistTabProps {
  onSymbolSelect: (data: { symbol: string; exchange: string }) => void;
  currentSymbol?: string;
}

const AutoWatchlistTab: React.FC<AutoWatchlistTabProps> = ({
  onSymbolSelect,
  currentSymbol,
}) => {
  const {
    indices,
    activeOptions,
    optionsByUnderlying,
    indexLiveData,
    isLoading,
    lastUpdated,
    error,
    refresh,
  } = useAutoWatchlist();

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return '';
    const diff = Math.floor((Date.now() - lastUpdated) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  }, [lastUpdated]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Zap size={14} className={styles.headerIcon} />
          <span>Active Markets</span>
        </div>
        <div className={styles.headerActions}>
          {lastUpdatedText && <span className={styles.lastUpdated}>{lastUpdatedText}</span>}
          <button
            className={styles.refreshBtn}
            onClick={refresh}
            disabled={isLoading}
            title="Refresh active options"
          >
            <RefreshCw size={12} className={isLoading ? styles.spinning : ''} />
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBar}>Data-hub unavailable: {error}</div>}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <TrendingUp size={11} />
          <span>Indices &amp; Commodities</span>
          <span className={styles.sectionCount}>{indices.length}</span>
        </div>
        <div className={styles.indexGrid}>
          {indices.map((idx) => {
            const live = indexLiveData[idx.alias];
            const isActive =
              currentSymbol?.toUpperCase() === idx.name.toUpperCase() ||
              currentSymbol?.toUpperCase() === idx.alias.toUpperCase();
            return (
              <div
                key={idx.alias}
                className={`${styles.indexCard} ${isActive ? styles.active : ''}`}
                onClick={() => onSymbolSelect({ symbol: idx.name, exchange: idx.exchange })}
                title={`Load ${idx.name} chart`}
              >
                <div className={styles.indexName}>{idx.alias}</div>
                {live ? (
                  <>
                    <div className={styles.indexLtp}>
                      {live.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`${styles.indexChange} ${live.changePercent >= 0 ? styles.positive : styles.negative}`}>
                      {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className={styles.indexExchange}>{idx.exchange}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Layers size={11} />
          <span>ATM Options</span>
          <span className={styles.sectionCount}>{activeOptions.length}</span>
        </div>

        {activeOptions.length === 0 && !isLoading && (
          <div className={styles.emptyState}>
            No active options. Ensure data-hub is running.
          </div>
        )}

        {isLoading && activeOptions.length === 0 && (
          <div className={styles.loadingState}>
            <RefreshCw size={13} className={styles.spinning} />
            <span>Loading options...</span>
          </div>
        )}

        {Object.entries(optionsByUnderlying).map(([underlying, options]) => {
          const alias = getUnderlyingAlias(underlying);
          const live = indexLiveData[alias];
          const idxEntry = indices.find(i => i.name === underlying);

          const sorted = [...options].sort((a, b) => {
            if (a.strike !== b.strike) return a.strike - b.strike;
            return a.type === 'CE' ? -1 : 1;
          });

          return (
            <div key={underlying} className={styles.underlyingGroup}>
              <div
                className={styles.underlyingHeader}
                onClick={() => idxEntry && onSymbolSelect({ symbol: idxEntry.name, exchange: idxEntry.exchange })}
                title={`Load ${underlying} chart`}
                role="button"
              >
                <span className={styles.underlyingName}>{alias}</span>
                <span className={styles.underlyingDivider} />
                {live ? (
                  <span className={`${styles.underlyingLtp} ${live.changePercent >= 0 ? styles.positive : styles.negative}`}>
                    {live.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{' '}
                    <span className={styles.underlyingChangePct}>
                      {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                    </span>
                  </span>
                ) : (
                  <span className={styles.underlyingLtp} style={{ color: 'var(--tv-color-text-secondary, #888)' }}>{underlying}</span>
                )}
              </div>

              <div className={styles.optionsList}>
                {sorted.map((opt: ActiveOption, i: number) => {
                  const isActiveSym = currentSymbol === opt.symbol;
                  const isAtm = opt.atm === true;
                  const ltpDisplay = opt.ltp != null
                    ? opt.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                    : '—';
                  const changeDisplay = opt.changePercent != null
                    ? `${opt.changePercent >= 0 ? '+' : ''}${opt.changePercent.toFixed(1)}%`
                    : '';
                  const isPositive = (opt.changePercent ?? 0) >= 0;

                  return (
                    <div
                      key={`${opt.symbol}-${i}`}
                      className={[
                        styles.optionItem,
                        isActiveSym ? styles.active : '',
                        isAtm ? styles.atmRow : '',
                      ].join(' ')}
                      onClick={() => onSymbolSelect({ symbol: opt.symbol, exchange: opt.exchange })}
                      title={`${opt.symbol} -- Click to view chart`}
                    >
                      <span className={styles.atmMarker}>{isAtm ? '●' : ''}</span>
                      <span className={`${styles.optStrike} ${isAtm ? styles.atmStrike : ''}`}>
                        {opt.strike}
                      </span>
                      <span className={`${styles.optType} ${opt.type === 'CE' ? styles.ceType : styles.peType}`}>
                        {opt.type}
                      </span>
                      <span className={styles.optSymbol} title={opt.symbol}>
                        {opt.symbol}
                      </span>
                      <span className={`${styles.optLtp} ${opt.ltp != null ? (isPositive ? styles.positive : styles.negative) : ''}`}>
                        {ltpDisplay}
                      </span>
                      {changeDisplay && (
                        <span className={`${styles.optChange} ${isPositive ? styles.positive : styles.negative}`}>
                          {changeDisplay}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(AutoWatchlistTab);
