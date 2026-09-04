import type { Pool } from 'pg';

// Le pool PostgreSQL est injecte explicitement dans buildApp() (cf. app.ts)
// plutot qu'importe directement par chaque route depuis database/client.
// Objectif : /health (et ses tests) ne doivent jamais avoir besoin d'un
// DATABASE_URL valide juste pour construire l'app -- cf. cahier des
// charges §22 ("aucune dependance externe").
declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool;
  }
}
