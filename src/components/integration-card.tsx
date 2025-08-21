import { NeonGradientCard } from "@/components/ui/neon-gradient-card";

interface IntegrationCardProps {
  icon: string;
  title: string;
  description: string;
  tag: string;
}

export function IntegrationCard({
  icon,
  title,
  description,
}: IntegrationCardProps) {
  return (
    // <div className="p-6 border rounded-2xl hover:bg-teal-50 transition-colors bg-white">
    <NeonGradientCard>
      <div className="flex items-start gap-4">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <div className="font-medium mb-1">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
    </NeonGradientCard>
    // </div>
  );
}
