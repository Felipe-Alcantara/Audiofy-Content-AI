import { useCallback, useEffect, useState } from "react";
import { getCosts } from "./audiofyClient.js";
import { usd, formatEpisodeDuration } from "./formatters.js";

function CostRow({ label, value }) {
  return (
    <li>
      <span className="row-main">{label}</span>
      <span className="costs-row-value">{value}</span>
    </li>
  );
}

function CostList({ entries, formatValue }) {
  if (!entries.length) {
    return (
      <ul className="row-list">
        <li className="muted">Sem dados.</li>
      </ul>
    );
  }
  return (
    <ul className="row-list">
      {entries.map(([key, value]) => (
        <CostRow key={key} label={key} value={formatValue(value)} />
      ))}
    </ul>
  );
}

function sortedEntries(record) {
  return Object.entries(record || {}).sort((a, b) => b[1] - a[1]);
}

export default function CostsTab() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: "loading" }));
    const response = await getCosts();
    if (!response || !response.ok) {
      setState({
        status: "error",
        data: null,
        error: response ? response.error : "Erro desconhecido.",
      });
      return;
    }
    setState({ status: "loaded", data: response, error: null });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const data = state.data;
  const hasData = data && data.total_episodes;
  const percentiles = (data && data.percentile_duration_seconds) || {};
  const estimates = (data && data.estimates) || {};

  return (
    <section className="panel">
      <h2>📊 Análise de custos de geração</h2>

      {state.status === "error" && (
        <p className="muted" role="alert">
          Erro ao carregar custos: {state.error}
        </p>
      )}

      {state.status !== "error" && !hasData && (
        <p className="muted">Nenhum episódio gerado ainda.</p>
      )}

      {hasData && (
        <div className="costs-grid">
          <div className="costs-summary-row">
            <div className="stat-tile">
              <span className="stat-label">Episódios</span>
              <span className="stat-value">
                {data.total_episodes.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Duração total</span>
              <span className="stat-value">
                {formatEpisodeDuration(data.total_duration_seconds)}
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Palavras (roteiro)</span>
              <span className="stat-value">
                {data.total_script_words.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Custo total</span>
              <span className="stat-value">{usd(data.total_cost_usd)}</span>
            </div>
          </div>

          <div className="costs-section">
            <h3>💰 Custo médio</h3>
            <div className="costs-summary-row">
              <div className="stat-tile small">
                <span className="stat-label">Por episódio</span>
                <span className="stat-value">{usd(data.average_cost_per_episode)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">Por minuto</span>
                <span className="stat-value">{usd(data.average_cost_per_minute)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">Por segundo</span>
                <span className="stat-value">{usd(data.average_cost_per_second, 6)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">Por palavra</span>
                <span className="stat-value">{usd(data.average_cost_per_word, 6)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">Mediana/minuto</span>
                <span className="stat-value">{usd(data.median_cost_per_minute)}</span>
              </div>
            </div>
          </div>

          <div className="costs-section">
            <h3>⏱️ Duração (percentis)</h3>
            <div className="costs-summary-row">
              <div className="stat-tile small">
                <span className="stat-label">50%</span>
                <span className="stat-value">{formatEpisodeDuration(percentiles.p50)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">75%</span>
                <span className="stat-value">{formatEpisodeDuration(percentiles.p75)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">90%</span>
                <span className="stat-value">{formatEpisodeDuration(percentiles.p90)}</span>
              </div>
            </div>
          </div>

          <div className="costs-two-columns">
            <div className="costs-section">
              <h3>🎤 Custo por modelo TTS</h3>
              <CostList entries={sortedEntries(data.cost_by_model)} formatValue={usd} />
            </div>
            <div className="costs-section">
              <h3>⚙️ Custo por perfil</h3>
              <CostList entries={sortedEntries(data.cost_by_profile)} formatValue={usd} />
            </div>
          </div>

          <div className="costs-section">
            <h3>📅 Custo por semana</h3>
            <ul className="row-list">
              {(data.weeks || []).length === 0 && <li className="muted">Sem dados.</li>}
              {(data.weeks || []).map((week) => (
                <CostRow
                  key={week.week}
                  label={week.week}
                  value={`${usd(week.cost_usd)} (${week.episodes} ep.)`}
                />
              ))}
            </ul>
          </div>

          <div className="costs-section">
            <h3>📈 Estimativas para próximas gerações</h3>
            <p className="muted small">
              Baseadas na média histórica de custo por segundo e por palavra.
            </p>
            <div className="costs-summary-row">
              <div className="stat-tile small">
                <span className="stat-label">10 minutos</span>
                <span className="stat-value">{usd(estimates.cost_10min)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">30 minutos</span>
                <span className="stat-value">{usd(estimates.cost_30min)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">1 hora</span>
                <span className="stat-value">{usd(estimates.cost_1h)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">1.000 palavras</span>
                <span className="stat-value">{usd(estimates.cost_1000_words)}</span>
              </div>
              <div className="stat-tile small">
                <span className="stat-label">5.000 palavras</span>
                <span className="stat-value">{usd(estimates.cost_5000_words)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <button type="button" className="ghost" onClick={load}>
        🔄 Atualizar
      </button>
    </section>
  );
}
