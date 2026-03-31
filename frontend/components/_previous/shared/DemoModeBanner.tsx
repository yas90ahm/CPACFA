'use client';

import { useEffect, useState } from 'react';
import { Beaker, X } from 'lucide-react';

export function DemoModeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem('sabit_demo_mode') === 'true');
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.removeItem('sabit_demo_mode');
    setVisible(false);
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 px-4 py-2 bg-[#7C5CFC]/10 border-b border-[#7C5CFC]/20 text-xs text-[#7C5CFC]">
      <Beaker className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">Demo Mode</span>
      <span className="text-gray-500">— Apex Capital Partners sample data. Changes will not persist.</span>
      <button
        onClick={dismiss}
        className="ml-auto p-1 rounded hover:bg-[#7C5CFC]/10 transition-colors"
        title="Dismiss banner"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
