'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import RouteForm from '@/components/RouteForm';
import { apiGet } from '@/lib/api';
import type { Route } from '@/lib/types';

export default function EditRoutePage() {
  const params = useParams();
  const id = params.id as string;
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Route>(`/api/routes/${id}`)
      .then(setRoute)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error-box">読み込み失敗: {error}</div>;
  if (!route) return <p style={{ padding: 20 }}>読込中...</p>;

  return <RouteForm existing={route} />;
}
