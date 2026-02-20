const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const NETWORK_ADDRESS = '0x3081aE79B403587959748591bBe1a2c12AeF5167';

const ABI = [
  {
    name: 'count',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'getAll',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'tuple[]', components: [
      { type: 'string', name: 'repoUrl' },
      { type: 'address', name: 'wallet' },
      { type: 'string', name: 'name' },
      { type: 'uint256', name: 'registeredAt' },
      { type: 'uint256', name: 'lastSeen' }
    ]}]
  }
];

async function main() {
  const rpc = process.env.BASE_RPC || 'https://mainnet.base.org';
  const client = createPublicClient({
    chain: base,
    transport: http(rpc)
  });

  try {
    const count = await client.readContract({
      address: NETWORK_ADDRESS,
      abi: ABI,
      functionName: 'count'
    });
    
    console.log('agent count:', count.toString());
    
    if (count > 0) {
      const agents = await client.readContract({
        address: NETWORK_ADDRESS,
        abi: ABI,
        functionName: 'getAll'
      });
      
      agents.forEach((agent, i) => {
        console.log(`agent ${i}: ${agent.name} - ${agent.repoUrl}`);
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
