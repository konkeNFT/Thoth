/**
 * thoth holder analysis tool
 * analyzes token holder distribution on Base
 * 
 * usage: node scripts/analyze-holders.js <token_address>
 */

const { ethers } = require('ethers');

const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const BASESCAN_API = 'https://api.basescan.org/api';

const ERC20_ABI = [
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

async function getTokenInfo(provider, tokenAddress) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply()
  ]);
  return { name, symbol, decimals: Number(decimals), totalSupply };
}

async function getTopHolders(tokenAddress, limit = 100) {
  // Use Basescan API to get token holders
  // Note: This requires a Basescan API key for higher limits
  const url = `${BASESCAN_API}?module=token&action=tokenholderlist&contractaddress=${tokenAddress}&page=1&offset=${limit}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === '1' && data.message === 'OK') {
      return data.result.map(h => ({
        address: h.TokenHolderAddress,
        balance: h.TokenHolderQuantity
      }));
    }
    
    // Fallback: return empty if API fails
    console.error('Basescan API returned:', data.message);
    return [];
  } catch (err) {
    console.error('Error fetching holders:', err.message);
    return [];
  }
}

function analyzeDistribution(holders, totalSupply, decimals) {
  if (holders.length === 0) {
    return { error: 'No holders data available' };
  }

  const total = BigInt(totalSupply);
  const holdersWithPercent = holders.map(h => {
    const balance = BigInt(h.balance);
    const percentage = Number(balance * 10000n / total) / 100;
    return {
      address: h.address,
      balance: ethers.formatUnits(h.balance, decimals),
      percentage: percentage.toFixed(4)
    };
  });

  // Calculate concentration metrics
  const top10Balance = holders.slice(0, 10).reduce((sum, h) => sum + Number(h.percentage), 0);
  const top50Balance = holders.slice(0, 50).reduce((sum, h) => sum + Number(h.percentage), 0);
  
  // Count whales (>1%)
  const whales = holdersWithPercent.filter(h => Number(h.percentage) >= 1).length;
  
  // Count sharks (0.1% - 1%)
  const sharks = holdersWithPercent.filter(h => Number(h.percentage) >= 0.1 && Number(h.percentage) < 1).length;

  return {
    totalHolders: holders.length,
    top10Concentration: top10Balance.toFixed(2) + '%',
    top50Concentration: top50Balance.toFixed(2) + '%',
    whaleCount: whales,
    sharkCount: sharks,
    topHolders: holdersWithPercent.slice(0, 20)
  };
}

async function main() {
  const tokenAddress = process.argv[2];
  
  if (!tokenAddress) {
    console.error('Usage: node scripts/analyze-holders.js <token_address>');
    process.exit(1);
  }

  console.log('Analyzing holders for:', tokenAddress);
  console.log('---');

  const provider = new ethers.JsonRpcProvider(RPC);
  
  // Get token info
  const tokenInfo = await getTokenInfo(provider, tokenAddress);
  console.log('Token:', tokenInfo.name, `(${tokenInfo.symbol})`);
  console.log('Total Supply:', ethers.formatUnits(tokenInfo.totalSupply, tokenInfo.decimals));
  console.log('---');

  // Get holders
  const holders = await getTopHolders(tokenAddress, 100);
  
  if (holders.length === 0) {
    console.log('Could not fetch holder data. Try using Basescan directly.');
    console.log(`https://basescan.org/token/${tokenAddress}#balances`);
    return;
  }

  // Analyze
  const analysis = analyzeDistribution(holders, tokenInfo.totalSupply, tokenInfo.decimals);
  
  console.log('Distribution Analysis:');
  console.log('- Total holders analyzed:', analysis.totalHolders);
  console.log('- Top 10 concentration:', analysis.top10Concentration);
  console.log('- Top 50 concentration:', analysis.top50Concentration);
  console.log('- Whales (>1%):', analysis.whaleCount);
  console.log('- Sharks (0.1-1%):', analysis.sharkCount);
  console.log('---');
  console.log('Top 20 holders:');
  analysis.topHolders.forEach((h, i) => {
    console.log(`${i + 1}. ${h.address} - ${h.balance} (${h.percentage}%)`);
  });
}

main().catch(console.error);
