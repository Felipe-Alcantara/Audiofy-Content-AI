import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import SettingsTab from "./SettingsTab.jsx";
import { mockAudiofy, renderWithProviders, SETTINGS_INFO } from "../testing/harness.jsx";

const KEYS = {
  ok: true,
  count: 2,
  effective_source: "pessoal",
  environment: { available: false },
  keys: [
    { name: "pessoal", priority: 1, masked: "sk-or-…abc", in_use: true, selected: true },
    { name: "trabalho", priority: 2, masked: "sk-or-…xyz", in_use: false, selected: false },
  ],
};

const PROFILES = {
  ok: true,
  active: "padrao",
  profiles: [
    {
      name: "padrao",
      description: "equilibrado",
      text_provider: "openrouter",
      text_model: "anthropic/claude",
      audit_model: "anthropic/claude",
      tts_model: "google/gemini-tts",
      presenters_spec: "ana:Kore",
      custom: false,
    },
    {
      name: "meu",
      description: "",
      text_provider: "openrouter",
      text_model: "openai/gpt",
      audit_model: "openai/gpt",
      tts_model: "google/gemini-tts",
      presenters_spec: "bruno:Puck",
      custom: true,
    },
  ],
};

const SETUP = {
  ok: true,
  ready: false,
  checks: [
    { name: "ffmpeg", ok: true, required: true, hint: "" },
    { name: "OCR local", ok: false, required: false, hint: "instale o tesseract" },
  ],
};

const BASE = {
  "settings-info": () => SETTINGS_INFO,
  status: () => ({ ok: true, anything_running: false, running: [], episodes: [] }),
  "keys-list": () => KEYS,
  "profiles-list": () => PROFILES,
  "setup-check": () => SETUP,
};

beforeEach(() => {
  delete window.audiofy;
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("SettingsTab", () => {
  it("resume a configuração ativa do perfil", async () => {
    mockAudiofy(BASE);

    renderWithProviders(<SettingsTab />);

    const summary = await screen.findByLabelText("Resumo da configuração ativa");
    expect(summary.textContent).toContain("perfil ativo:   padrao");
    expect(summary.textContent).toContain("tts:            google/gemini-tts");
    expect(summary.textContent).toContain("chave:          configurada (pessoal)");
    expect(summary.textContent).toContain("apresentadores: ana:Kore:curiosa");
  });

  it("lista as chaves mascaradas, marcando a que está em uso", async () => {
    mockAudiofy(BASE);

    renderWithProviders(<SettingsTab />);

    expect(await screen.findByText("#1 · pessoal")).toBeInTheDocument();
    expect(screen.getByText("sk-or-…abc")).toBeInTheDocument();
    expect(screen.getByText("em uso")).toBeInTheDocument();
    expect(screen.getByText(/2 chaves cadastradas .* em uso: pessoal/)).toBeInTheDocument();
  });

  it("registra uma chave nova pela bridge", async () => {
    const bridge = mockAudiofy(BASE);

    renderWithProviders(<SettingsTab />);
    await screen.findByText("#1 · pessoal");

    fireEvent.change(screen.getByLabelText("Nome da chave"), { target: { value: "nova" } });
    fireEvent.change(screen.getByLabelText("Chave do OpenRouter"), {
      target: { value: "sk-or-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "➕ Registrar chave" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(["keys-add", "nova"], "sk-or-123"));
  });

  it("ativa outra chave e recarrega a lista", async () => {
    const bridge = mockAudiofy({ ...BASE, "keys-use": () => ({ ok: true }) });

    renderWithProviders(<SettingsTab />);
    await screen.findByText("#2 · trabalho");

    fireEvent.click(screen.getAllByRole("button", { name: "usar" })[0]);

    await waitFor(() =>
      expect(bridge).toHaveBeenCalledWith(["keys-use", "trabalho"], undefined)
    );
    expect(await screen.findByText("✓ trabalho agora está em uso.")).toBeInTheDocument();
  });

  it("mostra o diagnóstico do ambiente com itens opcionais", async () => {
    mockAudiofy(BASE);

    renderWithProviders(<SettingsTab />);

    expect(await screen.findByText("OCR local")).toBeInTheDocument();
    expect(screen.getByText("instale o tesseract")).toBeInTheDocument();
    expect(screen.getByText("opcional")).toBeInTheDocument();
    expect(screen.getByText("Há itens obrigatórios que precisam de atenção.")).toBeInTheDocument();
  });

  it("agrupa perfis por categoria e ativa o escolhido", async () => {
    const bridge = mockAudiofy({ ...BASE, "profiles-activate": () => ({ ok: true }) });

    renderWithProviders(<SettingsTab />);

    // O perfil ativo é da Claude API, então essa categoria abre selecionada.
    expect(await screen.findByText("padrao")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Claude API" })).toHaveAttribute(
      "aria-selected", "true"
    );
    expect(screen.getByText("ativo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Personalizados" }));
    expect(await screen.findByText("meu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ativar" }));
    await waitFor(() =>
      expect(bridge).toHaveBeenCalledWith(["profiles-activate", "meu"], undefined)
    );
  });

  it("remove um perfil personalizado só após confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const bridge = mockAudiofy(BASE);

    renderWithProviders(<SettingsTab />);
    await screen.findByText("padrao");
    fireEvent.click(screen.getByRole("tab", { name: "Personalizados" }));

    fireEvent.click(await screen.findByRole("button", { name: "Remover perfil meu" }));

    expect(window.confirm).toHaveBeenCalledWith('Remover o perfil "meu"?');
    expect(bridge.mock.calls.some((call) => call[0][0] === "profiles-remove")).toBe(false);
  });

  it("abre o editor de perfil com o catálogo de modelos", async () => {
    mockAudiofy({
      ...BASE,
      "models-list": () => ({
        ok: true,
        text_models: [
          { id: "anthropic/claude", vendor: "anthropic", price_line: "US$ 3/M" },
          { id: "openai/gpt", vendor: "openai", price_line: "US$ 2/M" },
        ],
        tts_models: [{ id: "google/gemini-tts", vendor: "google", price_line: "US$ 10/M" }],
        tts_tiers: {
          "google/gemini-tts": { tier: "padrao", label: "Padrão", effective_cost_per_m_chars: 10 },
        },
        voice_catalogs: { "google/gemini-tts": { Kore: "firme", Sulafat: "calorosa" } },
        language_ambiguous_models: [],
        language_forcing_models: [],
      }),
    });

    renderWithProviders(<SettingsTab />);
    await screen.findByText("padrao");

    fireEvent.click(screen.getAllByRole("button", { name: "editar" })[0]);

    expect(await screen.findByText("Editar perfil: padrao")).toBeInTheDocument();
    expect(screen.getByText("Padrão — US$ 10/M caracteres")).toBeInTheDocument();
    expect(screen.getByDisplayValue("padrao")).toHaveAttribute("readonly");
  });

  it("salva o perfil editado com o spec de apresentadores", async () => {
    const bridge = mockAudiofy({
      ...BASE,
      "models-list": () => ({
        ok: true,
        text_models: [{ id: "anthropic/claude", vendor: "anthropic", price_line: "US$ 3/M" }],
        tts_models: [{ id: "google/gemini-tts", vendor: "google", price_line: "US$ 10/M" }],
        tts_tiers: {},
        voice_catalogs: { "google/gemini-tts": { Kore: "firme" } },
        language_ambiguous_models: [],
        language_forcing_models: [],
      }),
      "profiles-save": () => ({ ok: true }),
    });

    renderWithProviders(<SettingsTab />);
    await screen.findByText("padrao");
    fireEvent.click(screen.getAllByRole("button", { name: "editar" })[0]);
    await screen.findByText("Editar perfil: padrao");

    fireEvent.submit(screen.getByRole("button", { name: "💾 Salvar e ativar" }).closest("form"));

    await waitFor(() => {
      const call = bridge.mock.calls.find((entry) => entry[0][0] === "profiles-save");
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1])).toMatchObject({
        name: "padrao",
        tts_model: "google/gemini-tts",
        presenters_spec: "ana:Kore",
        activate: true,
      });
    });
  });
});
