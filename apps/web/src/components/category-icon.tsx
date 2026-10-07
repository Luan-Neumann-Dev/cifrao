import {
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleDollarSign,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  PartyPopper,
  PawPrint,
  Plane,
  Repeat,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Undo2,
  Utensils,
  Wallet,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * O seed grava o ícone da categoria como o nome kebab-case do Lucide. Importar
 * o pacote inteiro dinamicamente puxaria mais de mil ícones para o bundle, então
 * o mapa cobre o que o seed usa e cai num genérico para o que o usuário criar.
 */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  utensils: Utensils,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'party-popper': PartyPopper,
  repeat: Repeat,
  'shopping-bag': ShoppingBag,
  wrench: Wrench,
  landmark: Landmark,
  'paw-print': PawPrint,
  plane: Plane,
  wallet: Wallet,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  undo: Undo2,
  sliders: SlidersHorizontal,
  'arrow-left-right': ArrowLeftRight,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || CircleDollarSign;
}

/**
 * Bolinha colorida do extrato: o ícone na cor da categoria sobre a mesma cor
 * bem diluída, como no design.
 */
export function CategoryBadge({
  icon,
  color,
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  className?: string;
}) {
  const Icon = categoryIcon(icon);
  const tint = color ?? 'var(--ink-2)';
  return (
    <span
      className={cn('flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full', className)}
      style={{
        color: tint,
        background: `color-mix(in srgb, ${tint} 13%, transparent)`,
      }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.85} />
    </span>
  );
}
