import { useState } from "react";
import CostsTab from "./CostsTab.jsx";

// Casca da versão React do renderer. Só a aba Custos está migrada nesta
// entrega; as demais são placeholders até as próximas etapas (ver
// docs/USO-PUBLICO.md).
const TABS = [
  { id: "chat", label: "💬 Chat" },
  { id: "content", label: "📚 Conteúdo" },
  { id: "episodes", label: "🎧 Episódios" },
  { id: "costs", label: "📊 Custos" },
  { id: "settings", label: "⚙️ Configurações" },
];

function Placeholder({ label }) {
  return (
    <section className="panel">
      <h2>{label}</h2>
      <p className="muted">Esta aba ainda não foi migrada para React.</p>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("costs");
  const activeMeta = TABS.find((tab) => tab.id === activeTab);

  return (
    <>
      <header>
        <div className="header-row">
          <h1>🎙️ Audiofy Content AI</h1>
          <nav id="tabs" role="tablist" aria-label="Áreas do Audiofy">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab${activeTab === tab.id ? " active" : ""}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {activeTab === "costs" ? <CostsTab /> : <Placeholder label={activeMeta.label} />}
      </main>
    </>
  );
}
