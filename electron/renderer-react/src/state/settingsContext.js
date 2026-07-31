import { createContext, useContext } from "react";

export const SettingsContext = createContext(null);

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings precisa estar dentro de <SettingsProvider>.");
  return value;
}
