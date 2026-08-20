import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import ContentTab from "./ContentTab.jsx";
import { mockAudiofy, renderWithProviders, SETTINGS_INFO } from "../testing/harness.jsx";

const SOURCES = {
  ok: true,
  sources: [
    { key: "custom", name: "Conteúdo próprio", description: "seus textos", ready: true },
    { key: "akita", name: "Akita", description: "blog do Akita", ready: false },
  ],
};

const ITEM_DETAIL = {
  ok: true,
  item_id: "conto-1",
  title: "Conto do mar",
  published_at: "2026-07-01",
  words: 1200,
  url: "",
  estimated_cost_usd: 0.2,
  estimate: {
    cost_usd: 0.2, cost_min_usd: 0.15, cost_max_usd: 0.3,
    duration_minutes: 9.5, sample_count: 3, speaking_rate_wpm: 126,
  },
};

function renderContent(props = {}) {
  return renderWithProviders(
    <ContentTab
      source="custom"
      onSourceChange={() => {}}
      reloadToken={0}
      onOpenChunks={() => {}}
      onDelegateExtraction={() => {}}
      {...props}
    />
  );
}

const BASE_HANDLERS = {
  "settings-info": () => SETTINGS_INFO,
  status: () => ({ ok: true, anything_running: false, running: [], episodes: [] }),
  sources: () => SOURCES,
  items: () => ({ ok: true, items: [{ item_id: "conto-1", title: "Conto do mar", published_at: "2026-07-01" }] }),
  item: () => ITEM_DETAIL,
  "generation-log": () => ({ ok: true, exists: false }),
};

beforeEach(() => {
  delete window.audiofy;
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("ContentTab", () => {
  it("lista os itens da fonte ativa e mostra o selo de prontidão", async () => {
    mockAudiofy(BASE_HANDLERS);

    renderContent();

    await waitFor(() => expect(screen.getByText("Conto do mar")).toBeInTheDocument());
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.getByText("✓ pronta")).toBeInTheDocument();
    expect(screen.getByText("Selecione um item à esquerda.")).toBeInTheDocument();
  });

  it("busca com o termo digitado, usando o comando search", async () => {
    const bridge = mockAudiofy({
      ...BASE_HANDLERS,
      search: () => ({ ok: true, items: [] }),
    });

    renderContent();
    await waitFor(() => expect(screen.getByText("Conto do mar")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Buscar na fonte ativa"), {
      target: { value: "mar" },
    });

    await waitFor(() =>
      expect(bridge).toHaveBeenCalledWith(["search", "custom", "mar"], undefined)
    );
    expect(await screen.findByText("Nenhum resultado para essa busca.")).toBeInTheDocument();
  });

  it("abre o detalhe do item selecionado com a estimativa de custo", async () => {
    mockAudiofy(BASE_HANDLERS);

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));

    expect(await screen.findByText(/Estimativa: ~US\$ 0.20/)).toBeInTheDocument();
    expect(screen.getByText(/1200 palavras/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🎙️ Gerar episódio" })).toBeInTheDocument();
  });

  it("gera o episódio com os argumentos do formulário após confirmar", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const bridge = mockAudiofy({
      ...BASE_HANDLERS,
      generate: () => ({ ok: true, started: true }),
    });

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    fireEvent.click(screen.getByRole("button", { name: "🎙️ Gerar episódio" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      ["generate", "custom", "conto-1", "--mode=adaptation"], undefined
    ));
  });

  it("não gera nada quando o usuário cancela a confirmação de custo", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const bridge = mockAudiofy(BASE_HANDLERS);

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    fireEvent.click(await screen.findByRole("button", { name: "🎙️ Gerar episódio" }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(bridge.mock.calls.some((call) => call[0][0] === "generate")).toBe(false);
  });

  it("na leitura fiel manda modo e voz, e troca o rótulo do botão", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const bridge = mockAudiofy({
      ...BASE_HANDLERS,
      // Perfil com dois apresentadores: sem voz única do perfil, o campo
      // Narrador aparece e a escolha vale para a geração.
      "settings-info": () => ({
        ...SETTINGS_INFO,
        presenters: [
          { speaker: "ana", voice: "Kore", style: "" },
          { speaker: "bruno", voice: "Sulafat", style: "" },
        ],
      }),
      generate: () => ({ ok: true, started: true }),
    });

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "verbatim" } });
    expect(await screen.findByRole("button", { name: "📖 Gerar leitura fiel" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Narrador"), { target: { value: "Sulafat" } });
    fireEvent.click(screen.getByRole("button", { name: "📖 Gerar leitura fiel" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      ["generate", "custom", "conto-1", "--mode=verbatim", "--voice=Sulafat",
        "--stability=natural"],
      undefined
    ));
  });

  it("manda a estabilidade escolhida e só nas leituras", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const bridge = mockAudiofy({
      ...BASE_HANDLERS,
      generate: () => ({ ok: true, started: true }),
    });

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    // No podcast adaptado não há direção vocal por trecho: o campo nem aparece.
    expect(screen.queryByLabelText("Estabilidade da voz")).toBeNull();

    fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "verbatim" } });
    fireEvent.change(await screen.findByLabelText("Estabilidade da voz"),
      { target: { value: "estavel" } });
    fireEvent.click(screen.getByRole("button", { name: "📖 Gerar leitura fiel" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      expect.arrayContaining(["--mode=verbatim", "--stability=estavel"]), undefined
    ));
  });

  it("na voz estável não promete planejamento de interpretação", async () => {
    mockAudiofy(BASE_HANDLERS);

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });
    fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "verbatim" } });

    expect(await screen.findByText(/A IA planeja apenas ritmo/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Estabilidade da voz"),
      { target: { value: "estavel" } });

    // Espera a re-renderização terminar antes de sair do teste: assertivas
    // síncronas aqui deixariam atualizações pendentes vazando para o próximo.
    expect(await screen.findByText(/sem etapa de planejamento de interpretação/))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/A IA planeja apenas ritmo/)).toBeNull());
  });

  it("acrescenta --force e --language quando escolhidos", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const bridge = mockAudiofy({ ...BASE_HANDLERS, generate: () => ({ ok: true, started: true }) });

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Idioma do episódio"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "🎙️ Gerar episódio" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      ["generate", "custom", "conto-1", "--mode=adaptation", "--force", "--language=en"], undefined
    ));
  });

  it("trava as opções e mostra o aviso enquanto a geração roda", async () => {
    mockAudiofy({
      ...BASE_HANDLERS,
      status: () => ({
        ok: true,
        anything_running: true,
        running: [],
        episodes: [{
          episode_id: "conto-1",
          state: "rodando",
          language: "pt-BR",
          progress: { current: 2, total: 8 },
          dir: "/d",
          cost_usd: 0.05,
          cost_exact: false,
        }],
      }),
    });

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));

    expect(await screen.findByText(/Geração em andamento/)).toBeInTheDocument();
    expect(screen.getByLabelText("Formato")).toBeDisabled();
    expect(screen.getByRole("button", { name: "🛑 Abortar agora" })).toBeInTheDocument();
  });

  it("adiciona uma URL como conteúdo e recarrega a lista", async () => {
    const bridge = mockAudiofy({
      ...BASE_HANDLERS,
      "add-url": () => ({ ok: true, item_id: "novo" }),
    });

    renderContent();
    await screen.findByText("Conto do mar");

    fireEvent.change(screen.getByLabelText("URL pública para adicionar"), {
      target: { value: "https://exemplo.test/post" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar URL" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(
      ["add-url", "https://exemplo.test/post"], undefined
    ));
  });

  it("diz quanto texto cabe na duração alvo e quanto cortar", async () => {
    mockAudiofy(BASE_HANDLERS);

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    fireEvent.change(screen.getByLabelText(/Duração alvo/), { target: { value: "5" } });

    // 1200 palavras a 126 palavras/min ≈ 9,5 min; em 5 min cabem 630.
    expect(await screen.findByText(/630 palavras/)).toBeInTheDocument();
    expect(screen.getByText(/cortar/i)).toBeInTheDocument();
  });

  it("não pede corte quando o texto já cabe na duração alvo", async () => {
    mockAudiofy(BASE_HANDLERS);

    renderContent();
    fireEvent.click(await screen.findByText("Conto do mar"));
    await screen.findByRole("button", { name: "🎙️ Gerar episódio" });

    fireEvent.change(screen.getByLabelText(/Duração alvo/), { target: { value: "30" } });

    expect(await screen.findByText(/já cabe/i)).toBeInTheDocument();
  });
});
