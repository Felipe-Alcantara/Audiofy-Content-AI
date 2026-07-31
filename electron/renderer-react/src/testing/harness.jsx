import { render } from "@testing-library/react";
import { vi } from "vitest";
import PlayerProvider from "../state/PlayerProvider.jsx";
import SettingsProvider from "../state/SettingsProvider.jsx";
import StatusProvider from "../state/StatusProvider.jsx";
import AudioProbe from "./AudioProbe.jsx";

// Bridge falsa roteada por comando: cada teste declara só os comandos que lhe
// interessam; os demais respondem com erro explícito, o que faz um comando
// esquecido aparecer como falha legível em vez de undefined.
export function mockAudiofy(handlers = {}, extras = {}) {
  const bridge = vi.fn((args, stdin) => {
    const handler = handlers[args[0]];
    if (!handler) return Promise.resolve({ ok: false, error: `sem mock para ${args[0]}` });
    return Promise.resolve(handler(args, stdin));
  });
  window.audiofy = {
    bridge,
    openPath: vi.fn().mockResolvedValue(null),
    chooseBackgroundMusic: vi.fn().mockResolvedValue(null),
    chooseContentFiles: vi.fn().mockResolvedValue([]),
    ...extras,
  };
  return bridge;
}

export function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <StatusProvider>
        <PlayerProvider>
          <AudioProbe />
          {ui}
        </PlayerProvider>
      </StatusProvider>
    </SettingsProvider>
  );
}

export const SETTINGS_INFO = {
  ok: true,
  profile: "padrao",
  text_provider: "openrouter",
  text_model: "anthropic/claude",
  audit_model: "anthropic/claude",
  subscription_model: "",
  profile_subscription_model: "",
  subscription_clis: [],
  tts_model: "google/gemini-tts",
  has_key: true,
  key_source: "pessoal",
  language: "pt-BR",
  overrides: [],
  presenters: [{ speaker: "ana", voice: "Kore", style: "curiosa" }],
  voice_catalogs: { "google/gemini-tts": { Kore: "firme", Sulafat: "calorosa" } },
};
