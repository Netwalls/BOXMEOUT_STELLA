#!/bin/bash
cd /Users/iamtechhunter/Documents/workspace/boxmeout_stella/contracts/contracts/boxmeout/src

# Remove Result<(), Symbol> return types
sed -i '' 's/ -> Result<(), Symbol> {/ {/g' *.rs

# Remove Result<i128, Symbol> return types  
sed -i '' 's/ -> Result<i128, Symbol> {/ -> i128 {/g' *.rs

# Remove Result<u128, Symbol> return types
sed -i '' 's/ -> Result<u128, Symbol> {/ -> u128 {/g' *.rs

# Remove Result<bool, Symbol> return types
sed -i '' 's/ -> Result<bool, Symbol> {/ -> bool {/g' *.rs

# Remove Result<Symbol, Symbol> return types
sed -i '' 's/ -> Result<Symbol, Symbol> {/ -> Symbol {/g' *.rs

# Remove Result<Vec<Symbol>, Symbol> return types
sed -i '' 's/ -> Result<Vec<Symbol>, Symbol> {/ -> Vec<Symbol> {/g' *.rs

# Remove Result<BytesN<32>, Symbol> return types
sed -i '' 's/ -> Result<BytesN<32>, Symbol> {/ -> BytesN<32> {/g' *.rs

# Remove Result<(u128, u128), Symbol> return types
sed -i '' 's/ -> Result<(u128, u128), Symbol> {/ -> (u128, u128) {/g' *.rs

echo "Fixed all Result<T, Symbol> return types"
