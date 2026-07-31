import { useCallback, useEffect, useRef, useState } from "react";
import { getItem, getItems, getSources, searchItems, syncSource } from "../lib/audiofyClient.js";
import AddContent from "./AddContent.jsx";
import ItemDetail from "./ItemDetail.jsx";

const SEARCH_DEBOUNCE_MS = 350;

export default function ContentTab({
  source, onSourceChange, reloadToken, onOpenChunks, onDelegateExtraction,
}) {
  const [sources, setSources] = useState([]);
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const debounceRef = useRef(null);

  const loadSources = useCallback(async () => {
    const result = await getSources();
    if (result.ok) setSources(result.sources);
  }, []);

  const loadItems = useCallback(async (term = "") => {
    const result = term ? await searchItems(source, term) : await getItems(source);
    if (!result.ok) {
      setItems([]);
      setItemsError(result.error);
      return;
    }
    setItemsError(null);
    setItems(result.items);
  }, [source]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Recarrega ao trocar de fonte, ao buscar (com debounce) e quando o Chat
  // criou conteúdo em outra aba (reloadToken).
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadItems(query.trim()), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(debounceRef.current);
  }, [loadItems, query, reloadToken]);

  const activeSource = sources.find((entry) => entry.key === source);

  const handleSelect = useCallback(async (item) => {
    const detail = await getItem(source, item.item_id);
    if (!detail.ok) return;
    setSelected({ ...detail, source });
  }, [source]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setStatusMessage("… sincronizando fonte");
    const result = await syncSource(source);
    setSyncing(false);
    if (!result.ok) {
      setStatusMessage(`✖ ${result.error}`);
      return;
    }
    setStatusMessage("");
    await loadSources();
    loadItems(query.trim());
  }, [loadItems, loadSources, query, source]);

  return (
    <>
      <section className="panel" id="panel-items">
        <div className="source-header">
          <div className="source-picker">
            <select
              title="Fonte de conteúdo"
              aria-label="Fonte de conteúdo"
              value={source}
              onChange={(event) => {
                setSelected(null);
                setStatusMessage("");
                onSourceChange(event.target.value);
              }}
            >
              {sources.map((entry) => (
                <option key={entry.key} value={entry.key} title={entry.description}>
                  {entry.name}
                </option>
              ))}
            </select>
            {activeSource && (
              <span className={`badge ${activeSource.ready ? "ok" : "warn"}`} role="status">
                {activeSource.ready ? "✓ pronta" : "⚠ requer sync"}
              </span>
            )}
          </div>
          <div className="toolbar">
            <input
              type="search"
              placeholder="🔎 Buscar nesta fonte…"
              aria-label="Buscar na fonte ativa"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="ghost"
              title="Atualiza a fonte"
              aria-label="Sincronizar fonte"
              disabled={syncing}
              onClick={handleSync}
            >
              🔄 Sincronizar
            </button>
          </div>
          <p id="source-status" className="muted small" role="status">
            {statusMessage || (activeSource && activeSource.description) || ""}
          </p>
        </div>

        {/* Adicionar conteúdo só existe na fonte própria: as demais são
            sincronizadas de fora. */}
        {source === "custom" && (
          <AddContent
            onAdded={() => loadItems(query.trim())}
            onDelegateExtraction={onDelegateExtraction}
          />
        )}

        <div className="items-header">
          <span className="muted small">
            {items.length ? `${items.length} item${items.length === 1 ? "" : "ns"}` : ""}
          </span>
        </div>
        <ul id="items">
          {itemsError && <li className="muted empty-state">{`✖ Erro: ${itemsError}`}</li>}
          {!itemsError && items.length === 0 && (
            <li className="muted empty-state">
              {query
                ? "Nenhum resultado para essa busca."
                : "Nenhum item — adicione conteúdo acima ou peça sugestões no Chat."}
            </li>
          )}
          {items.map((item) => (
            <li
              key={item.item_id}
              className={`item-row${selected && selected.item_id === item.item_id ? " selected" : ""}`}
              onClick={() => handleSelect(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect(item);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="item-main">
                <span className="item-title">{item.title}</span>
                <span className="date">{item.published_at}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" id="panel-detail">
        {selected
          ? (
            <ItemDetail
              key={`${selected.source}:${selected.item_id}`}
              item={selected}
              source={selected.source}
              onItemsChanged={() => loadItems(query.trim())}
              onOpenChunks={onOpenChunks}
            />
          )
          : <div className="muted">Selecione um item à esquerda.</div>}
      </section>
    </>
  );
}
