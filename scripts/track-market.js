#!/usr/bin/env node
/**
 * DAIMON Market Pattern Tracker
 * Logs price data and detects accumulation/distribution patterns
 */

const fs = require('fs');
const path = require('path');

const DAIMON_ADDRESS = '0x98c51C8E958ccCD37F798b2B9332d148E2c05D57';
const HISTORY_FILE = path.join(__dirname, '../memory/market-history.jsonl');

async function fetchMarketData() {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${DAIMON_ADDRESS}`;
  const res = await fetch(url);
  const data = await res.json();
  const pair = data.pairs?.[0];
  
  if (!pair) throw new Error('No pair data');
  
  return {
    timestamp: new Date().toISOString(),
    price: parseFloat(pair.priceUsd),
    mcap: pair.fdv,
    volume24h: pair.volume?.h24,
    volume6h: pair.volume?.h6,
    volume1h: pair.volume?.h1,
    change24h: pair.priceChange?.h24,
    change6h: pair.priceChange?.h6,
    change1h: pair.priceChange?.h1,
    buys24h: pair.txns?.h24?.buys,
    sells24h: pair.txns?.h24?.sells,
    liquidity: pair.liquidity?.usd
  };
}

function detectPattern(current, history) {
  const patterns = [];
  
  // Need at least 3 data points for pattern detection
  if (history.length < 3) return ['insufficient data'];
  
  const recent = history.slice(-6); // last 6 entries
  const prices = recent.map(h => h.price);
  const changes = recent.map(h => h.change6h || 0);
  
  // Blow-off top detection
  const maxPrice = Math.max(...prices);
  const currentDrop = ((maxPrice - current.price) / maxPrice) * 100;
  if (currentDrop > 40 && current.change6h < -30) {
    patterns.push('BLOW_OFF_TOP');
  }
  
  // Accumulation detection
  const avgVolume = recent.reduce((a, b) => a + (b.volume6h || 0), 0) / recent.length;
  const sellBuyRatio = current.sells24h / Math.max(current.buys24h, 1);
  if (sellBuyRatio > 1.5 && current.change6h > 0) {
    patterns.push('ACCUMULATION');
  }
  
  // Distribution detection
  if (sellBuyRatio > 2 && current.change6h < -10) {
    patterns.push('DISTRIBUTION');
  }
  
  // Capitulation detection
  if (current.change1h < -40 && current.volume1h > avgVolume * 2) {
    patterns.push('CAPITULATION');
  }
  
  // Recovery detection
  const prevPrice = prices[prices.length - 2];
  if (current.price > prevPrice * 1.1 && current.change1h > 5) {
    patterns.push('RECOVERY_ATTEMPT');
  }
  
  return patterns.length > 0 ? patterns : ['NEUTRAL'];
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const content = fs.readFileSync(HISTORY_FILE, 'utf8');
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function saveEntry(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(HISTORY_FILE, line);
}

async function main() {
  try {
    console.log('fetching market data...');
    const data = await fetchMarketData();
    
    console.log('\n=== DAIMON Market Data ===');
    console.log(`price: $${data.price.toFixed(8)}`);
    console.log(`mcap: $${Math.round(data.mcap).toLocaleString()}`);
    console.log(`24h change: ${data.change24h?.toFixed(1)}%`);
    console.log(`6h change: ${data.change6h?.toFixed(1)}%`);
    console.log(`1h change: ${data.change1h?.toFixed(1)}%`);
    console.log(`volume 24h: $${Math.round(data.volume24h).toLocaleString()}`);
    console.log(`sells/buys: ${data.sells24h} / ${data.buys24h} (${(data.sells24h / data.buys24h).toFixed(2)}x)`);
    
    const history = loadHistory();
    const patterns = detectPattern(data, history);
    
    console.log(`\n>>> PATTERNS: ${patterns.join(', ')}`);
    
    // Save to history
    saveEntry({ ...data, patterns });
    console.log(`\nlogged to ${HISTORY_FILE}`);
    
    // Output for other scripts
    console.log('\n--- JSON ---');
    console.log(JSON.stringify({ ...data, patterns }, null, 2));
    
  } catch (err) {
    console.error('error:', err.message);
    process.exit(1);
  }
}

main();