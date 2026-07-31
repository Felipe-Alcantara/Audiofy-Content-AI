import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import EpisodesTab from "./EpisodesTab.jsx";
import { mockAudiofy, renderWithProviders, SETTINGS_INFO } from "../testing/harness.jsx";

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
});

function renderEpisodes(props = {}) {
  return renderWithProviders(
    <EpisodesTab onOpenChunks={() => {}} onOpenTeleprompter={() => {}} {...props} />
  );
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
    const bridge = mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: false, running: [], episodes: [episode()] }),
    });

    renderEpisodes();

    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());
    expect(bridge).toHaveBeenCalledWith(["status"], undefined);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 áudio(s) pronto(s) em 1 registro(s), do mais recente ao mais antigo."
    );
    expect(screen.getByText("artigo-x")).toBeInTheDocument();
    expect(screen.getByText("concluido")).toBeInTheDocument();
    expect(screen.getByText("1h 2min 5s")).toBeInTheDocument();
    expect(screen.getByText("08/07/2026")).toBeInTheDocument();
    expect(screen.getByText("final.mp3 · 5 MiB")).toBeInTheDocument();
    expect(screen.getByText(/podcast adaptado/)).toHaveTextContent(
      "podcast adaptado · US$ 0.1234 · 4.200 palavras de origem · sem auditoria"
    );
  });

  it("mostra o estado vazio quando não há episódios", async () => {
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: false, running: [], episodes: [] }),
    });

    renderEpisodes();

    await waitFor(() =>
      expect(screen.getByText("Nenhum episódio ainda.")).toBeInTheDocument()
    );
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum episódio gerado ainda.");
  });

  it("mostra a mensagem de erro quando a bridge falha", async () => {
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: false, error: "backend indisponível" }),
    });

    renderEpisodes();

    await waitFor(() =>
      expect(screen.getByText("Erro ao carregar episódios: backend indisponível"))
        .toBeInTheDocument()
    );
  });

  it("exibe progresso e aborta o episódio rodando", async () => {
    const bridge = mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({
        ok: true, anything_running: true, running: [RUNNING], episodes: [RUNNING],
      }),
      abort: () => ({ ok: true, aborted: true, stopped: true }),
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("rodando · 3/10")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Abortar artigo-y" }));

    await waitFor(() => expect(bridge).toHaveBeenCalledWith(["abort", "artigo-y"], undefined));
  });

  it("não oferece abortar quando o aborto já foi pedido", async () => {
    const running = { ...RUNNING, abort_requested_at: "2026-07-09T10:31:00Z" };
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: true, running: [running], episodes: [running] }),
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("Artigo Y")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Abortar artigo-y" })).toBeNull();
  });

  it("abre a pasta do episódio pelo openPath do preload", async () => {
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: false, running: [], episodes: [episode()] }),
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta de artigo-x" }));

    await waitFor(() =>
      expect(window.audiofy.openPath).toHaveBeenCalledWith("/data/episodes/artigo-x")
    );
  });

  it("oferece ouvir, revisar chunks e acompanhar quando há MP3", async () => {
    const onOpenChunks = vi.fn();
    const onOpenTeleprompter = vi.fn();
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: false, running: [], episodes: [episode()] }),
    });

    renderEpisodes({ onOpenChunks, onOpenTeleprompter });
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "🧪 chunks" }));
    fireEvent.click(screen.getByRole("button", { name: "📖 acompanhar" }));

    expect(onOpenChunks).toHaveBeenCalledWith("artigo-x", "Artigo X", undefined);
    expect(onOpenTeleprompter).toHaveBeenCalledWith(expect.objectContaining({
      episode_id: "artigo-x",
    }));
    expect(screen.getByRole("button", { name: "Ouvir artigo-x" })).toBeInTheDocument();
  });

  it("esconde ouvir e acompanhar enquanto não há MP3", async () => {
    mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({
        ok: true, anything_running: true, running: [RUNNING], episodes: [RUNNING],
      }),
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("Artigo Y")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Ouvir artigo-y" })).toBeNull();
    expect(screen.queryByRole("button", { name: "📖 acompanhar" })).toBeNull();
  });

  it("repete o status a cada 2s enquanto houver geração rodando e para depois", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let call = 0;
    const bridge = mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => {
        call += 1;
        return call === 1
          ? { ok: true, anything_running: true, running: [RUNNING], episodes: [RUNNING] }
          : { ok: true, anything_running: false, running: [], episodes: [episode()] };
      },
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("Artigo Y")).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());

    const callsAfterStop = bridge.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(bridge).toHaveBeenCalledTimes(callsAfterStop);
  });

  it("recarrega ao clicar em Atualizar", async () => {
    const bridge = mockAudiofy({
      "settings-info": () => SETTINGS_INFO,
      status: () => ({ ok: true, anything_running: false, running: [], episodes: [episode()] }),
    });

    renderEpisodes();
    await waitFor(() => expect(screen.getByText("Artigo X")).toBeInTheDocument());
    const before = bridge.mock.calls.filter((call) => call[0][0] === "status").length;

    fireEvent.click(screen.getByRole("button", { name: "🔄 Atualizar" }));

    await waitFor(() => expect(
      bridge.mock.calls.filter((call) => call[0][0] === "status").length
    ).toBe(before + 1));
  });
});
