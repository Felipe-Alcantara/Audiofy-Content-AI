import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsContext } from "./settingsContext.js";
import { getSettingsInfo } from "../lib/audiofyClient.js";

// `settings-info` descreve o perfil ativo (provedor de texto, modelos, chave,
// idioma, apresentadores). Header, aba Conteúdo e aba Configurações leem daqui.
export default function SettingsProvider({ children }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const result = await getSettingsInfo();
    if (result && result.ok) {
      setInfo(result);
      setError(null);
    } else {
      setError(result ? result.error : "Erro desconhecido.");
    }
    return result;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({ info, error, reload }), [info, error, reload]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
