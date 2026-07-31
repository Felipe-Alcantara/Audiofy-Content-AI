import { createContext, useContext } from "react";

// Contexto separado do provider para manter cada arquivo com um só tipo de
// export (componentes vs. hooks), como pede a regra react/only-export-components.
export const PlayerContext = createContext(null);

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer precisa estar dentro de <PlayerProvider>.");
  return value;
}
