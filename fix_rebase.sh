#!/bin/bash
cd /home/blackghost/Documents/BOXMEOUT_STELLA/BOXMEOUT_STELLA
export EDITOR=true
export GIT_EDITOR=true
echo "Aborting current rebase..."
git rebase --abort 2>&1 || true
echo "Done. Please try git pull --no-edit next."
