// Starts the Doc365 API server.
import { config } from './config.js';
import { app } from './app.js';

app.listen(config.port, () => {
  console.log(`Doc365 API running on http://localhost:${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/health`);
});
