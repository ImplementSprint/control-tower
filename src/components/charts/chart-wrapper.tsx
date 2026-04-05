import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ChartWrapperProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function ChartWrapper({ title, description, children, className }: ChartWrapperProps) {
  return (
    <Card className={`rounded-2xl border-border/70 ${className ?? ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
