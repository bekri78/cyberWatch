import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * En production (Railway), les variables sont injectees directement par la
 * plateforme -- ce chargement est un no-op silencieux si aucun fichier .env
 * n'existe. En local, il permet de definir DATABASE_URL/DEEPSEEK_API_KEY
 * dans un .env (copie de .env.example) sans les exporter a la main.
 */
loadDotenv();

/**
 * Configuration lue depuis les variables d'environnement.
 *
 * DATABASE_URL est obligatoire depuis la Phase 2 (integration PostgreSQL).
 * DEEPSEEK_API_KEY reste optionnelle pour l'instant : elle deviendra
 * obligatoire en Phase 5 (integration DeepSeek) — il suffira de retirer
 * `.optional()` ci-dessous.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire depuis la Phase 2'),
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
