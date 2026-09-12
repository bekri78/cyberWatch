import { useEffect, useRef, useState } from 'react';
import { fetchExploration } from '../api/client';
import type { ExplorationResult } from '../api/types';

export function useExploration(params: URLSearchParams) {
  const key = params.toString();
  const [data, setData] = useState<ExplorationResult | null>(null);
  // Keep the last map visible while the newly selected feed is loading.
  const [mapItems, setMapItems] = useState<ExplorationResult['mapItems']>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const activeKey = useRef(key);
  activeKey.current = key;
  useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort();
    setLoading(true); setData(null); setError(null); setMore(false);
    fetchExploration(new URLSearchParams(key), controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setData(result); setMapItems(result.mapItems ?? []); } })
      .catch((err: Error) => { if (!controller.signal.aborted) { setError(err.message); setMapItems([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [key]);
  async function loadMore() {
    if (!data?.nextCursor || more || moreController.current) return;
    const controller = new AbortController();
    moreController.current = controller;
    setMore(true); setError(null);
    const next = new URLSearchParams(key); next.set('cursor', data.nextCursor);
    try {
      const result = await fetchExploration(next, controller.signal);
      if (!controller.signal.aborted && activeKey.current === key) {
        setData((previous) => previous ? { ...result, items: [...new Map([...previous.items, ...result.items].map((item) => [item.id, item])).values()] } : result);
      }
    } catch (err) { if (!controller.signal.aborted && activeKey.current === key) setError((err as Error).message); }
    finally { if (moreController.current === controller) moreController.current = null; if (!controller.signal.aborted) setMore(false); }
  }
  return { data, mapItems, loading, more, error, loadMore };
}
