#!/bin/bash
# Run diagnostic and save results with machine identifier
# Usage: ./run-diagnostics.sh [machine-name]

MACHINE_NAME="${1:-$(hostname -s)}"
OUTPUT_FILE="diagnostic-${MACHINE_NAME}-$(date +%Y%m%d-%H%M%S).json"

echo "Running diagnostics for: $MACHINE_NAME"
echo "Output will be saved to: $OUTPUT_FILE"
echo ""

npx tsx scripts/diagnose-benchmark-environment.ts 2>&1 | tee "$OUTPUT_FILE"

echo ""
echo "Diagnostics saved to: $OUTPUT_FILE"
