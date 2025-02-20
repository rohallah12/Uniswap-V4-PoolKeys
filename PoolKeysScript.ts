/**
 * NOTE: use this script for fetching pool keys
 * this scripts filters the event logs emitted from PoolManager, then finds corresponding poolkey by decoding the
 * event logs
 */
// Required libraries
const axios = require('axios');
const {ethers} = require('ethers');
require('dotenv');

// Replace with your actual Arbiscan API key
const API_KEY = process.env.ARBISCAN_KEY;

// The Arbiscan API endpoint
const ARBISCAN_API_URL = 'https://api.arbiscan.io/api';

// The PoolManager contract address on Arbitrum
const POOL_MANAGER_ADDRESS = '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32';

// The event signature (topic0) for the Initialize event
// keccak256("Initialize(PoolId,address,address,uint24,int24,address,uint160,int24)")
const INITIALIZE_TOPIC0 =
  '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';

//use address 0 for ETH
const ETH = '0x0000000000000000000000000000000000000000';

//USDT address on arbitrum
const USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const CURRENCY_0 = ETH;
const CURRENCY_1 = USDT;

/**
 * Fetches Initialize events using the Arbiscan logs API.
 *
 * @param {string} fromBlock - The starting block number.
 * @param {string} toBlock - The ending block number.
 * @param {string} [currency0] - (Optional) The address to filter for currency0 (indexed topic2).
 * @param {string} [currency1] - (Optional) The address to filter for currency1 (indexed topic3).
 * @param {number} [page=1] - The page number (for pagination).
 * @param {number} [offset=1000] - The maximum number of records per page.
 * @returns {Promise<Array>} - An array of log objects.
 */
async function fetchInitializeEvents(
  fromBlock,
  toBlock,
  currency0,
  currency1,
  page = 1,
  offset = 1000
) {
  // Build the query parameters.
  const params: any = {
    module: 'logs',
    action: 'getLogs',
    fromBlock,
    toBlock,
    address: POOL_MANAGER_ADDRESS,
    topic0: INITIALIZE_TOPIC0,
    page,
    offset,
    apikey: API_KEY,
  };

  if (currency0) {
    params.topic2 = currency0.toLowerCase();
  }
  if (currency1) {
    params.topic3 = currency1.toLowerCase();
  }
  //And the topics, we want both
  if (currency0 && currency1) {
    params.topic2_3_opr = 'and';
  }

  try {
    const response = await axios.get(ARBISCAN_API_URL, {params});
    // Uncomment the next line to inspect the full response
    // console.log("Full response data:", response.data);
    if (response.data.status === '1') {
      return response.data.result;
    } else {
      console.error('API Error:', response.data.message, response.data.result);
      return [];
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}

/**
 * Decodes a raw log into a PoolKey object.
 *
 * The PoolKey type is:
 * {
 *   currency0: string;
 *   currency1: string;
 *   fee: number;
 *   tickSpacing: number;
 *   hooks: string;
 * }
 *
 * The event is defined as:
 *   event Initialize(
 *       PoolId indexed id,
 *       Currency indexed currency0,
 *       Currency indexed currency1,
 *       uint24 fee,
 *       int24 tickSpacing,
 *       IHooks hooks,
 *       uint160 sqrtPriceX96,
 *       int24 tick
 *   );
 *
 * @param {object} log - The log object from Arbiscan.
 * @returns {object} - The decoded PoolKey.
 */
function decodePoolKeyFromLog(log) {
  // Check that we have at least four topics.
  if (!log.topics || log.topics.length < 4) {
    throw new Error('Log does not have enough topics');
  }

  // Extract indexed parameters (they are 32-byte hex values)
  // For addresses, remove the first 12 bytes (24 hex characters) of padding.
  const rawCurrency0 = log.topics[2]; // 32-byte padded address
  const rawCurrency1 = log.topics[3];
  const currency0 = ethers.utils.getAddress(
    ethers.utils.hexDataSlice(rawCurrency0, 12)
  );
  const currency1 = ethers.utils.getAddress(
    ethers.utils.hexDataSlice(rawCurrency1, 12)
  );

  // Decode the non-indexed data.
  // The non-indexed data encodes five parameters:
  //   [0]: fee (uint24)
  //   [1]: tickSpacing (int24)
  //   [2]: hooks (address)
  //   [3]: sqrtPriceX96 (uint160) not used here
  //   [4]: tick (int24)not used here
  const nonIndexedTypes = ['uint24', 'int24', 'address', 'uint160', 'int24'];
  const decoded = ethers.utils.defaultAbiCoder.decode(
    nonIndexedTypes,
    log.data
  );

  const fee = parseInt(ethers.utils.hexValue(decoded[0]));
  const tickSpacing = parseInt(ethers.utils.hexValue(decoded[1]));
  const hooks = ethers.utils.getAddress(decoded[2]);

  // Return only the PoolKey data.
  return {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
  };
}

function padAddressTo32Bytes(address) {
  const clean = address.startsWith('0x')
    ? address.slice(2).toLowerCase()
    : address.toLowerCase();

  if (clean.length !== 40) {
    throw new Error('Invalid Ethereum address length');
  }
  const padded = clean.padStart(64, '0');
  return '0x' + padded;
}

async function main() {
  const fromBlock = process.argv[2] || '280369405';
  const toBlock = process.argv[3] || '305235670';
  const currency0Arg = CURRENCY_0;
  const currency1Arg = CURRENCY_1;

  console.log(
    `Fetching Initialize events from block ${fromBlock} to ${toBlock}`
  );
  if (currency0Arg) {
    console.log(`Filtering by currency0: ${currency0Arg}`);
  }
  if (currency1Arg) {
    console.log(`Filtering by currency1: ${currency1Arg}`);
  }

  const rawEvents = await fetchInitializeEvents(
    fromBlock,
    toBlock,
    padAddressTo32Bytes(currency0Arg),
    currency1Arg ? padAddressTo32Bytes(currency1Arg) : ''
  );

  // Decode each log into a PoolKey object.
  const poolKeys = rawEvents
    .map(event => {
      try {
        return decodePoolKeyFromLog(event);
      } catch (error) {
        console.error('Error decoding event:', error, event);
        return null;
      }
    })
    .filter(key => key !== null);

  console.log('Decoded PoolKeys:');
  console.log(JSON.stringify(poolKeys, null, 2));
}

main();
