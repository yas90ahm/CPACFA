'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PrivacyTransparencyWidget({ className }: { className?: string }) {
  return (
    <Card className={cn('border-muted/60 bg-muted/20', className)}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-xs font-medium text-foreground">Privacy &amp; Transparency</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Local Processing Active. Your PII (Names/Account Numbers) is masked before analysis. Data is encrypted at rest.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
