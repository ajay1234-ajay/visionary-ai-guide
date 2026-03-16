import { ArrowLeft, ArrowRight, ArrowUp, Navigation2, Flag, CornerUpLeft, CornerUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RouteStep {
  instruction: string;
  distance: string;
  maneuver: string; // osrm maneuver type
  modifier?: string; // left / right / straight / slight left / etc
  lat?: number;      // waypoint latitude for proximity tracking
  lng?: number;      // waypoint longitude for proximity tracking
}

function StepIcon({ maneuver, modifier }: { maneuver: string; modifier?: string }) {
  const mod = modifier?.toLowerCase() ?? '';
  if (maneuver === 'depart') return <Navigation2 className="w-4 h-4" />;
  if (maneuver === 'arrive') return <Flag className="w-4 h-4 text-destructive" />;
  if (mod.includes('left') && mod.includes('slight')) return <CornerUpLeft className="w-4 h-4" />;
  if (mod.includes('right') && mod.includes('slight')) return <CornerUpRight className="w-4 h-4" />;
  if (mod.includes('left')) return <ArrowLeft className="w-4 h-4" />;
  if (mod.includes('right')) return <ArrowRight className="w-4 h-4" />;
  return <ArrowUp className="w-4 h-4" />;
}

interface RouteStepsProps {
  steps: RouteStep[];
  activeIndex: number;
  isTamil: boolean;
}

export default function RouteSteps({ steps, activeIndex, isTamil }: RouteStepsProps) {
  if (!steps.length) return null;

  return (
    <ol className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {steps.map((step, i) => (
        <li
          key={i}
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg text-sm transition-colors border',
            i === activeIndex
              ? 'bg-primary/10 border-primary text-primary font-semibold'
              : i < activeIndex
              ? 'bg-muted/40 border-transparent text-muted-foreground line-through'
              : 'bg-background border-border text-foreground',
          )}
          aria-current={i === activeIndex ? 'step' : undefined}
        >
          <span className={cn(
            'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
            i === activeIndex ? 'bg-primary text-primary-foreground' :
            i < activeIndex ? 'bg-muted text-muted-foreground' :
            'bg-secondary/20 text-secondary-foreground'
          )}>
            <StepIcon maneuver={step.maneuver} modifier={step.modifier} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="leading-snug">{step.instruction}</p>
            {step.distance && (
              <p className="text-xs text-muted-foreground mt-0.5">{step.distance}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
