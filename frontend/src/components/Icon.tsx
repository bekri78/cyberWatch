import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bug,
  Brain,
  Building2,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe,
  Hash,
  MapPin,
  RefreshCw,
  Rss,
  Satellite,
  Shield,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icones lucide-react (convention shadcn/ui, cf. components.json
 * "iconLibrary": "lucide") -- remplace le jeu de glyphes SVG faits main
 * utilise avant la migration Tailwind/shadcn. Meme API (`name`/`size`/
 * `color`) pour ne pas devoir toucher chaque appelant.
 */
const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  feed: Rss,
  sparkles: Sparkles,
  sliders: SlidersHorizontal,
  brain: Brain,
  activity: Activity,
  alert: AlertTriangle,
  bug: Bug,
  zap: Zap,
  satellite: Satellite,
  file: FileText,
  refresh: RefreshCw,
  check: Check,
  arrowRight: ArrowRight,
  globe: Globe,
  clock: Clock,
  close: X,
  mapPin: MapPin,
  building: Building2,
  target: Fingerprint,
  hash: Hash,
  calendar: Calendar,
  link: ExternalLink,
};

export function Icon({
  name,
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.75,
}: {
  name: keyof typeof ICONS;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const LucideIconComponent = ICONS[name];
  if (!LucideIconComponent) return null;
  return <LucideIconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
