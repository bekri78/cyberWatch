import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utilitaire standard shadcn/ui (clsx + tailwind-merge) -- attendu par le
 * code de mapcn.vercel.app tel quel (import `cn` depuis `@/lib/utils`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
