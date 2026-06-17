"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          // session invalid or refresh failed -> force login
          router.replace('/login?expired=1');
          return;
        }
        if (mounted) setChecked(true);
      } catch (err) {
        router.replace('/login?expired=1');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
