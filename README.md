# This is an script you can use to fetch a poolKey:<br>

1- Replace the `ARBISCAN_KEY` with your arbiscan, etherscan, etc api key<br>
2- Replace the `currency0` and `currency1` with the pair tokens (**sorted**)<br>
3- Modify the block range (start and end) according to your chain, i have put the pool manager deployment block as the starting block<br>
This script will fetch all the pool initialization events with `currency0` and `currency1` and then extracts the pool key from the event.<br>

# Installation
`npm install axios ethers dotenv`

# Running
`node PoolKeysScript.ts`
