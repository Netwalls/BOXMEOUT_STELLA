@echo off
cd /d "c:\Users\User\Documents\GitHub\BOXMEOUT_STELLA"
"C:\Program Files\Git\bin\git.exe" add -A
"C:\Program Files\Git\bin\git.exe" commit -m "feat(amm): add get_lp_position query for LP token balance and pool share"
"C:\Program Files\Git\bin\git.exe" push
pause
