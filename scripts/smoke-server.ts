/**
 * Minimal server that mounts only trial-balance and cfo-dashboard routers for smoke testing.
 * Run: npx tsx scripts/smoke-server.ts
 * Then run: node scripts/smoke-test-modular-routes.mjs (with BASE_URL=http://localhost:3002)
 */

import express from 'express';
import trialBalanceRouter from '../src/routes/trial-balance/index.js';
import cfoDashboardRouter from '../src/routes/cfo-dashboard/index.js';

const app = express();
const PORT = Number(process.env.PORT) || 3002;

app.use(express.json());
app.use('/api/trial-balance', trialBalanceRouter);
app.use('/api/cfo-dashboard', cfoDashboardRouter);

app.listen(PORT, () => {
  console.log(`Smoke server listening on http://localhost:${PORT}`);
  console.log('Run: BASE_URL=http://localhost:' + PORT + ' node scripts/smoke-test-modular-routes.mjs');
});
