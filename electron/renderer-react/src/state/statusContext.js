import { createContext, useContext } from "react";

export const StatusContext = createContext(null);

export function useStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error("useStatus precisa estar dentro de <StatusProvider>.");
  return value;
}
