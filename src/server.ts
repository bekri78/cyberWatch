import { buildApp } from './app';
import { env } from './config/env';

const app = buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`Signal ${signal} recu, arret en cours...`);
    await app.close();
    process.exit(0);
  });
}

start();
