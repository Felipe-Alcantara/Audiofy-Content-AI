import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusContext } from "./statusContext.js";
import { getStatus } from "../lib/audiofyClient.js";

// Uma única fonte de verdade para o `status` da bridge: o banner do header, a
// aba Episódios e o painel de detalhe do Conteúdo liam o mesmo overview no
// renderer vanilla. O polling de 2 s só roda enquanto há geração em andamento.
const POLL_INTERVAL_MS = 2000;

export default function StatusProvider({ children }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getStatus();
    if (!mountedRef.current) return result;
    if (!result || !result.ok) {
      setError(result ? result.error : "Erro desconhecido.");
      return result;
    }
    setError(null);
    setOverview(result);
    clearTimeout(timerRef.current);
    if (result.anything_running) timerRef.current = setTimeout(refresh, POLL_INTERVAL_MS);
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [refresh]);

  const value = useMemo(() => ({
    overview,
    error,
    refresh,
    episodes: (overview && overview.episodes) || [],
    running: (overview && overview.running) || [],
    anythingRunning: Boolean(overview && overview.anything_running),
  }), [overview, error, refresh]);

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}
