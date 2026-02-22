#!/usr/bin/env python3
import subprocess
import os
import sys

os.chdir('/home/blackghost/Documents/BOXMEOUT_STELLA/BOXMEOUT_STELLA')

# Set up environment to avoid interactive editors
env = os.environ.copy()
env['GIT_EDITOR'] = 'true'
env['EDITOR'] = 'true'

try:
    # First, try to abort any in-progress rebase
    print("Attempting to abort rebase...")
    result = subprocess.run(['git', 'rebase', '--abort'], env=env, capture_output=True, text=True, timeout=5)
    print(f"Abort result: {result.returncode}")
    if result.stdout:
        print(f"stdout: {result.stdout}")
    if result.stderr:
        print(f"stderr: {result.stderr}")
except subprocess.TimeoutExpired:
    print("Timeout on rebase abort")
except Exception as e:
    print(f"Error: {e}")

# Check git status
print("\nGit status:")
try:
    result = subprocess.run(['git', 'status'], capture_output=True, text=True, timeout=5)
    print(result.stdout)
    if result.stderr:
        print(f"stderr: {result.stderr}")
except Exception as e:
    print(f"Error checking status: {e}")
