#!/bin/bash

# New Perp Contracts Deployment Script
# Usage: ./script/deploy.sh [network] [options]
# Networks: local, sepolia, bsc, etc.

set -e

NETWORK=${1:-local}
RPC_URL=""

case $NETWORK in
  local)
    RPC_URL="http://localhost:8545"
    echo "Deploying to local Anvil..."
    ;;
  sepolia)
    RPC_URL=${SEPOLIA_RPC_URL:-"https://sepolia.infura.io/v3/YOUR_KEY"}
    echo "Deploying to Sepolia..."
    ;;
  bsc)
    RPC_URL=${BSC_RPC_URL:-"https://bsc-dataseed.binance.org"}
    echo "Deploying to BSC..."
    ;;
  *)
    echo "Unknown network: $NETWORK"
    echo "Usage: ./script/deploy.sh [local|sepolia|bsc]"
    exit 1
    ;;
esac

# Check if PRIVATE_KEY is set
if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY environment variable is not set"
  exit 1
fi

echo "Deploying New Perp contracts..."
echo "Network: $NETWORK"
echo "RPC URL: $RPC_URL"

# Deploy all contracts
forge script script/DeployNewPerp.s.sol:DeployNewPerp \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  -vvvv

echo "Deployment complete!"
echo "Check the output above for contract addresses."

