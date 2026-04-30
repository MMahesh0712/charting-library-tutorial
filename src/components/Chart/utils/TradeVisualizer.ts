/**
 * TradeVisualizer — Manages trade markers and price lines on the chart.
 *
 * For each active trade:
 *  - Entry arrow marker (up for CE, down for PE) with strategy label
 *  - SL Price Line:     red dashed line labeled  "SL [BET]: ₹24800"
 *  - Target Price Line: green dashed line labeled "T1 [GP]: ₹25200"
 *  - Exit marker:       circle when trade closes
 *
 * Multi-strategy: multiple strategies on the same index each get
 * distinct labels and separate price lines.
 */

import type { ChartSignal } from '../../../hooks/useChartSignals';

// Strategy color palette for price line differentiation
const STRATEGY_COLORS: Record<string, string> = {
  GAP_PULSE: '#26a69a',  // teal
  BET: '#ff9800',  // orange
  STRUCTURE_PULSE: '#ab47bc',  // purple
  GTL: '#42a5f5',  // blue
  DNX_SEZ: '#ffca28',  // amber
};

const STRATEGY_CODES: Record<string, string> = {
  GAP_PULSE: 'GP',
  BET: 'BET',
  STRUCTURE_PULSE: 'SP',
  GTL: 'GTL',
  DNX_SEZ: 'DNX',
};

interface ManagedPriceLine {
  slLine: any | null;
  targetLine: any | null;
  tradeId: string;
}

/**
 * TradeVisualizer manages the lifecycle of trade-related visual elements on a chart.
 */
export class TradeVisualizer {
  private mainSeries: any;
  private activePriceLines: Map<string, ManagedPriceLine> = new Map();

  constructor(mainSeries: any) {
    this.mainSeries = mainSeries;
  }

  /**
   * Update all markers and price lines based on the current set of signals.
   * Called whenever signals change.
   */
  /**
   * TSK-CS-016: Deduplicate signals before processing.
   * Keep latest signal per (tradeId|id) — handles hydration + live WS overlap.
   */
  private _dedup(signals: ChartSignal[]): ChartSignal[] {
    const seen = new Map<string, ChartSignal>();
    for (const s of signals) {
      const key = s.tradeId ? `${s.tradeId}-${s.eventType}` : s.id;
      const existing = seen.get(key);
      // Keep the one with the higher receivedAt (most recent)
      if (!existing || s.receivedAt > existing.receivedAt) {
        seen.set(key, s);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.time - b.time);
  }

  updateFromSignals(signals: ChartSignal[]): void {
    if (!this.mainSeries) return;
    // TSK-CS-016: dedup first
    signals = this._dedup(signals);

    // 1. Build set of active trade IDs from ENTRY signals (no matching EXIT)
    const entrySignals = signals.filter(s => s.eventType === 'ENTRY');
    // TSK-CS-016: PARTIAL_EXIT → position still open, keep price lines.
    // Full exits (EXIT/SL/TARGET) → remove price lines.
    const exitSignals = signals.filter(s =>
      s.eventType === 'EXIT' || s.eventType === 'SL' || s.eventType === 'TARGET' ||
      s.eventType === 'SL_HIT' || s.eventType === 'TARGET_HIT'
    );
    // Partial exits — count them but don't close the trade
    const partialExitSignals = signals.filter(s => s.eventType === 'PARTIAL_EXIT');

    // TSK-CS-016: Match exits to entries by tradeId (preferred) or
    // strategy+side+symbol within a 24h window (fallback when tradeId absent).
    const exitedTradeIds = new Set<string>();
    const MATCH_WINDOW_SEC = 24 * 60 * 60; // 24 hours
    for (const exit of exitSignals) {
      if (exit.tradeId) {
        exitedTradeIds.add(exit.tradeId);
      } else {
        // Fallback: same strategy + side + symbol, entry time ≤ exit time, within window
        const matchEntry = entrySignals.find(e =>
          e.strategy === exit.strategy &&
          e.side === exit.side &&
          e.symbol === exit.symbol &&
          e.time <= exit.time &&
          (exit.time - e.time) <= MATCH_WINDOW_SEC &&
          !exitedTradeIds.has(e.id)
        );
        if (matchEntry) exitedTradeIds.add(matchEntry.id);
      }
    }

    // 2. Determine which entries are still "active" (no exit found)
    const activeEntries = entrySignals.filter(e => {
      if (e.tradeId && exitedTradeIds.has(e.tradeId)) return false;
      return !exitedTradeIds.has(e.id);
    });

    // 3. Remove price lines for trades that are no longer active
    const activeKeys = new Set(activeEntries.map(e => e.tradeId || e.id));
    for (const [key, managed] of this.activePriceLines) {
      if (!activeKeys.has(key)) {
        this._removePriceLines(managed);
        this.activePriceLines.delete(key);
      }
    }

    // 4. Add/update price lines for active trades
    for (const entry of activeEntries) {
      const key = entry.tradeId || entry.id;
      if (!this.activePriceLines.has(key)) {
        this._createPriceLines(entry, key);
      } else {
        this._updatePriceLines(entry, key);
      }
    }
  }

  /**
   * Create SL and Target price lines for a trade entry.
   */
  private _createPriceLines(signal: ChartSignal, key: string): void {
    if (!this.mainSeries) return;

    const code = STRATEGY_CODES[signal.strategy] || signal.strategy.slice(0, 3);
    const managed: ManagedPriceLine = { slLine: null, targetLine: null, tradeId: key };

    // SL Price Line — standard red, dashed, with strategy label
    if (signal.sl && signal.sl > 0) {
      try {
        managed.slLine = this.mainSeries.createPriceLine({
          price: signal.sl,
          color: '#f44336',           // standard red
          lineWidth: 1,
          lineStyle: 2,              // dashed
          axisLabelVisible: true,
          title: `SL [${code}]`,
          lineVisible: true,
        });
      } catch (_) { }
    }

    // Target Price Line — standard green, dashed, with strategy label
    if (signal.target && signal.target > 0) {
      try {
        managed.targetLine = this.mainSeries.createPriceLine({
          price: signal.target,
          color: '#4caf50',           // standard green
          lineWidth: 1,
          lineStyle: 2,              // dashed
          axisLabelVisible: true,
          title: `T1 [${code}]`,
          lineVisible: true,
        });
      } catch (_) { }
    }

    this.activePriceLines.set(key, managed);
  }

  /**
   * Update existing price lines for a trade (e.g. trailing SL).
   */
  private _updatePriceLines(signal: ChartSignal, key: string): void {
    const managed = this.activePriceLines.get(key);
    if (!managed || !this.mainSeries) return;

    const code = STRATEGY_CODES[signal.strategy] || signal.strategy.slice(0, 3);

    // TSK-CS-016: Update SL — price AND label title (trailing SL changes label)
    if (signal.sl && signal.sl > 0) {
      if (managed.slLine) {
        // applyOptions updates both price and title atomically
        managed.slLine.applyOptions({ price: signal.sl, title: `SL [${code}]` });
      } else {
        managed.slLine = this.mainSeries.createPriceLine({
          price: signal.sl,
          color: '#f44336',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `SL [${code}]`,
          lineVisible: true,
        });
      }
    } else if (managed.slLine) {
      this.mainSeries.removePriceLine(managed.slLine);
      managed.slLine = null;
    }

    // TSK-CS-016: Update Target — support TP1/TP2 label differentiation
    if (signal.target && signal.target > 0) {
      const targetLabel = (signal as any).tp2 ? 'TP2' : 'T1';
      if (managed.targetLine) {
        managed.targetLine.applyOptions({ price: signal.target, title: `${targetLabel} [${code}]` });
      } else {
        managed.targetLine = this.mainSeries.createPriceLine({
          price: signal.target,
          color: '#4caf50',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${targetLabel} [${code}]`,
          lineVisible: true,
        });
      }
    } else if (managed.targetLine) {
      this.mainSeries.removePriceLine(managed.targetLine);
      managed.targetLine = null;
    }
  }

  /**
   * Remove SL and Target price lines for a closed/exited trade.
   */
  private _removePriceLines(managed: ManagedPriceLine): void {
    if (!this.mainSeries) return;

    if (managed.slLine) {
      try { this.mainSeries.removePriceLine(managed.slLine); } catch (_) { }
    }
    if (managed.targetLine) {
      try { this.mainSeries.removePriceLine(managed.targetLine); } catch (_) { }
    }
  }

  /**
   * Full cleanup — remove all managed price lines.
   */
  dispose(): void {
    for (const [, managed] of this.activePriceLines) {
      this._removePriceLines(managed);
    }
    this.activePriceLines.clear();
    this.mainSeries = null;
  }
}

export default TradeVisualizer;
