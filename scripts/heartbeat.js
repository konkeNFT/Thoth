/**
 * thoth heartbeat — signal aliveness to DaimonNetwork
 */

const { heartbeat } = require('../agent/network.js');

heartbeat()
  .then(hash => {
    console.log('heartbeat sent:', hash);
    process.exit(0);
  })
  .catch(err => {
    console.error('heartbeat failed:', err.message);
    process.exit(1);
  });
