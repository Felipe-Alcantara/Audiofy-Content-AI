import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EpisodesTab from "./EpisodesTab.jsx";

function episode(overrides = {}) {
  return {
    episode_id: "artigo-x",
    title: "Artigo X",
    state: "concluido",
    progress: { current: 0, total: 0 },
    dir: "/data/episodes/artigo-x",
    mp3: "/data/episodes/artigo-x/final.mp3",
    file_name: "final.mp3",
    file_size_bytes: 5 * 1024 * 1024,
    duration_seconds: 3725,
    source_created_at: "2026-07-08",
    generated_at: "2026-07-09T10:30:00Z",
    cost_usd: 0.1234,
    cost_exact: true,
    generation_mode: "podcast",
    source_words: 4200,
    ...overrides,
  };
}

const RUNNING = episode({
  episode_id: "artigo-y",
  title: "Artigo Y",
  state: "rodando",
  progress: { current: 3, total: 10 },
  mp3: null,
  file_name: null,
  ...{},
});

function mockBridge(...responses) {
  const bridge = vi.fn();
  for (const response of responses) bridge.mockResolvedValueOnce(response);
  bridge.mockResolvedValue(responses[responses.length - 1]);
  window.audiofy = { bridge, openPath: vi.fn().mockResolvedValue(null) };
  return bridge;
}

beforeEach(() => {
  delete window.audiofy;
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
  vi.useRealTimers();
});

describe("EpisodesTab", () => {
  it("carrega o status via bridge(['status']) e renderiza os episódios", async () => {
    mockBridge({ ok: true, anything_running: false, running: [], episodes: [episode()] });

    render(<EpisodesTab />);

    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    expect(window.audiofy.bridge).toHaveBeenCalledWith(["status"], undefined);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 áudio(s) pronto(s) em 1 registro(s), do mais recente ao mais antigo."
    );
    expect(screen.getByText("artigo-x")).toBeInTheDocument();
    expect(screen.getByText("concluido")).toBeInTheDocument();
    expect(screen.getByText("1h 2min 5s")).toBeInTheDocument();
    expect(screen.getByText("08/07/2026")).toBeInTheDocument();
    expect(screen.getByText("final.mp3 · 5 MiB")).toBeInTheDocument();
    expect(
      screen.getByText(/leitura fiel|podcast adaptado/)
    ).toHaveTextContent("podcast adaptado · US$ 0.1234 · 4.200 palavras de origem · sem auditoria");
  });

  it("mostra o estado vazio quando não há episódios", async () => {
    mockBridge({ ok: true, anything_running: false, running: [], episodes: [] });

    render(<EpisodesTab />);

    await waitFor(() =>
      expect(screen.getByText("Nenhum episódio ainda.")).toBeInTheDocument()
    );
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum episódio gerado ainda.");
  });

  it("mostra a mensagem de erro quando a bridge falha", async () => {
    mockBridge({ ok: false, error: "backend indisponível" });

    render(<EpisodesTab />);

    await waitFor(() =>
      expect(
        screen.getByText("Erro ao carregar episódios: backend indisponível")
      ).toBeInTheDocument()
    );
  });

  it("exibe progresso e o botão de abortar em episódio rodando", async () => {
    const bridge = mockBridge({
      ok: true, anything_running: true, running: [RUNNING], episodes: [RUNNING],
    });

    render(<EpisodesTab />);

    await waitFor(() => expect(screen.getByText("rodando · 3/10")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Abortar artigo-y" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(["abort", "artigo-y"], undefined));
  });

  it("não oferece abortar quando o aborto já foi pedido", async () => {
    const running = { ...RUNNING, abort_requested_at: "2026-07-09T10:31:00Z" };
    mockBridge({ ok: true, anything_running: true, running: [running], episodes: [running] });

    render(<EpisodesTab />);

    await waitFor(() => expect(screen.getByText("Artigo Y")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Abortar artigo-y" })).toBeNull();
  });

  it("abre a pasta do episódio pelo openPath do preload", async () => {
    mockBridge({ ok: true, anything_running: false, running: [], episodes: [episode()] });

    render(<EpisodesTab />);
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta de artigo-x" }));

    await waitFor(() =>
      expect(window.audiofy.openPath).toHaveBeenCalledWith("/data/episodes/artigo-x")
    );
  });

  it("repete o status a cada 2s enquanto houver geração rodando", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const bridge = mockBridge(
      { ok: true, anything_running: true, running: [RUNNING], episodes: [RUNNING] },
      { ok: true, anything_running: false, running: [], episodes: [episode()] },
    );

    render(<EpisodesTab />);
    await waitFor(() => expect(screen.getByText("Artigo Y")).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    // Sem nada rodando o polling para: o tempo passa e não há nova chamada.
    const callsAfterStop = bridge.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(bridge).toHaveBeenCalledTimes(callsAfterStop);
  });

  it("recarrega ao clicar em Atualizar", async () => {
    const bridge = mockBridge({
      ok: true, anything_running: false, running: [], episodes: [episode()],
    });

    render(<EpisodesTab />);
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "🔄 Atualizar" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledTimes(2));
  });
});
