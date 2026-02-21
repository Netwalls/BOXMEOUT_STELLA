@echo off
cd /d "c:\Users\User\Documents\GitHub\BOXMEOUT_STELLA"
"C:\Program Files\Git\bin\git.exe" add contracts/contracts/boxmeout/src/amm.rs contracts/contracts/boxmeout/tests/amm_test.rs LP_POSITION_IMPLEMENTATION.md
"C:\Program Files\Git\bin\git.exe" commit -m "feat(amm): add get_lp_position query for LP token balance and pool share"
"C:\Program Files\Git\bin\git.exe" checkout -b stella
"C:\Program Files\Git\bin\git.exe" push -u origin stella
pause
