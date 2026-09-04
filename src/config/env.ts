import { z } from 'zod';

/**
 * Configuration lue depuis les variables d'environnement.
 *
 * DATABASE_URL et DEEPSEEK_API_KEY sont optionnelles pour l'instant : la
 * Phase 1 (Fastify + /health) n'en a pas besoin. Elles deviendront
 * obligatoires respectivement en Phase 2 (PostgreSQL) et Phase 5 (DeepSeek) —
 * il suffira de retirer `.optional()` ci-dessous.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Configuration invalide (variables d\'environnement) :');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
