import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CostsTab from "./CostsTab.jsx";

const SAMPLE_COSTS = {
  ok: true,
  total_episodes: 3,
  total_duration_seconds: 3725,
  total_script_words: 4200,
  total_cost_usd: 1.2345,
  average_cost_per_episode: 0.4115,
  average_cost_per_minute: 0.0199,
  average_cost_per_second: 0.000331,
  average_cost_per_word: 0.000294,
  median_cost_per_minute: 0.0198,
  percentile_duration_seconds: { p50: 1200, p75: 1500, p90: 1800 },
  cost_by_model: { "gpt-4o-mini-tts": 0.9, "eleven-multilingual": 0.3345 },
  cost_by_profile: { padrao: 1.0 },
  weeks: [{ week: "2026-W30", cost_usd: 0.8, episodes: 3 }],
  estimates: {
    cost_10min: 0.199,
    cost_30min: 0.597,
    cost_1h: 1.194,
    cost_1000_words: 0.294,
    cost_5000_words: 1.47,
  },
};

function mockBridge(response) {
  window.audiofy = { bridge: vi.fn().mockResolvedValue(response) };
}

beforeEach(() => {
  delete window.audiofy;
});

afterEach(() => {
  cleanup();
  delete window.audiofy;
});

describe("CostsTab", () => {
  it("carrega custos via window.audiofy.bridge(['costs']) e renderiza os totais", async () => {
    mockBridge(SAMPLE_COSTS);

    render(<CostsTab />);

    await waitFor(() => expect(screen.getByText("US$ 1.2345")).toBeInTheDocument());

    expect(window.audiofy.bridge).toHaveBeenCalledWith(["costs"], undefined);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1h 2min 5s")).toBeInTheDocument();
    expect(screen.getByText("4.200")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini-tts")).toBeInTheDocument();
    expect(screen.getByText("2026-W30")).toBeInTheDocument();
    expect(screen.getByText("US$ 0.9000")).toBeInTheDocument();
  });

  it("mostra o estado vazio quando não há episódios gerados", async () => {
    mockBridge({ ok: true, total_episodes: 0 });

    render(<CostsTab />);

    await waitFor(() =>
      expect(screen.getByText("Nenhum episódio gerado ainda.")).toBeInTheDocument()
    );
  });

  it("mostra a mensagem de erro quando a bridge falha", async () => {
    mockBridge({ ok: false, error: "backend indisponível" });

    render(<CostsTab />);

    await waitFor(() =>
      expect(
        screen.getByText("Erro ao carregar custos: backend indisponível")
      ).toBeInTheDocument()
    );
  });

  it("recarrega os dados ao clicar em Atualizar", async () => {
    mockBridge(SAMPLE_COSTS);
    render(<CostsTab />);
    await waitFor(() => expect(screen.getByText("US$ 1.2345")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "🔄 Atualizar" }));

    await waitFor(() => expect(window.audiofy.bridge).toHaveBeenCalledTimes(2));
  });
});
