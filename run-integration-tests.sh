#!/bin/bash
export ENABLE_UNIT_SERVER=true
npm test -- tests/unit/integration.test.ts tests/unit/test-data-management.test.ts
