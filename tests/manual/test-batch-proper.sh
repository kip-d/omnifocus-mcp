#!/bin/bash
# Test batch operation with stdin kept open until responses received

NO_CACHE_WARMING=true node dist/index.js <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"omnifocus_write","arguments":{"mutation":{"operation":"batch","target":"project","operations":[{"operation":"create","target":"project","data":{"name":"BATCH_VERIFY_CLEAN","tempId":"proj1"}},{"operation":"create","target":"task","data":{"name":"TASK_A","parentTempId":"proj1","tempId":"task1"}},{"operation":"create","target":"task","data":{"name":"TASK_B","parentTempId":"proj1","tempId":"task2"}}],"createSequentially":true,"returnMapping":true}}}}
EOF
