/* global __dirname, console, process */
/* eslint-disable no-console */

const path = require('node:path');

// The smoke runner starts from frontend/, while the compiled job service loads
// its runtime configuration from the repository root.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const { env } = require('../../dist/config/environment.js');
const { createDatabasePool, closeDatabasePool } = require('../../dist/config/database.js');
const { runManualMonthlyUpgradeSweep } = require('../../dist/services/jobs/subscriptionJobs.js');

const reference = process.argv[2] ? new Date(process.argv[2]) : null;

if (!reference || Number.isNaN(reference.getTime())) {
  throw new Error('Pass an ISO-8601 reference time to the MMU sweep helper.');
}

createDatabasePool(env);

runManualMonthlyUpgradeSweep(reference)
  .then(() => console.log(`MMU sweep completed at ${reference.toISOString()}`))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
