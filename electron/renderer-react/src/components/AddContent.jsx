import { useCallback, useState } from "react";
import { addFile, addText, addUrl, chooseContentFiles } from "../lib/audiofyClient.js";
import { fileBaseName } from "../lib/formatters.js";

// A extração roda por bibliotecas locais (pypdf/python-docx/ebooklib/OCR).
// A IA só é sugerida quando nada local funcionou, porque um livro ou dezenas
// de páginas escaneadas custariam caro e demorariam muito para transcrever.
const METHOD_LABELS = {
  pdftotext: "PDF lido localmente (Poppler)",
  pypdf: "PDF lido localmente (pypdf)",
  "python-docx": "DOCX lido localmente",
  ebooklib: "EPUB lido localmente",
  "plain-text": "texto lido diretamente",
  "tesseract-ocr": "OCR local (Tesseract)",
};

function describeExtraction(result) {
  return `${result.title} — ${result.words} palavras · ` +
    `${METHOD_LABELS[result.method] || result.method}`;
}

export default function AddContent({ onAdded, onDelegateExtraction }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filesStatus, setFilesStatus] = useState("");

  const handleAddUrl = useCallback(async () => {
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    const result = await addUrl(value);
    setBusy(false);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setUrl("");
    onAdded();
  }, [onAdded, url]);

  const handleAddText = useCallback(async () => {
    const cleanTitle = title.trim();
    const cleanText = text.trim();
    if (!cleanTitle || !cleanText) return;
    const result = await addText(cleanTitle, cleanText);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setTitle("");
    setText("");
    onAdded();
  }, [onAdded, text, title]);

  const handleAddFiles = useCallback(async () => {
    const paths = await chooseContentFiles();
    if (!paths.length) return;
    setBusy(true);
    const added = [];
    const failed = [];
    const pending = [];
    for (const [index, filePath] of paths.entries()) {
      setFilesStatus(`Extraindo ${index + 1}/${paths.length}: ${fileBaseName(filePath)}…`);
      const result = await addFile(filePath);
      if (!result.ok) failed.push(`${fileBaseName(filePath)}: ${result.error}`);
      else if (result.added) added.push(describeExtraction(result));
      else pending.push({ filePath, reason: result.reason });
    }
    setBusy(false);
    const lines = [];
    if (added.length) lines.push(`✓ ${added.length} adicionado(s): ${added.join(" · ")}`);
    if (failed.length) lines.push(`✖ ${failed.length} com erro: ${failed.join(" · ")}`);
    setFilesStatus(lines.join("  |  ") || "Nenhum arquivo processado.");
    if (added.length) onAdded();
    for (const { filePath, reason } of pending) {
      await onDelegateExtraction(filePath, reason);
    }
  }, [onAdded, onDelegateExtraction]);

  return (
    <details className="add-content">
      <summary>
        <span>➕ Adicionar conteúdo</span>
        <span className="muted small">URL ou texto colado</span>
      </summary>
      <div className="add-content-body">
        <div className="add-content-row">
          <input
            type="url"
            placeholder="https://… (extrai o texto da página)"
            aria-label="URL pública para adicionar"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="button" className="primary" disabled={busy} onClick={handleAddUrl}>
            Adicionar URL
          </button>
        </div>

        <div className="add-content-divider"><span>ou envie arquivos</span></div>
        <div className="add-content-row">
          <button type="button" className="primary" disabled={busy} onClick={handleAddFiles}>
            📎 Escolher arquivos…
          </button>
          <p className="muted small">
            PDF, DOCX, EPUB, TXT/MD e imagens. O texto é extraído localmente por
            bibliotecas — sem custo de IA.
          </p>
        </div>
        <p id="add-files-status" className="muted small" role="status">{filesStatus}</p>

        <div className="add-content-divider"><span>ou cole o texto</span></div>
        <input
          type="text"
          placeholder="Título"
          aria-label="Título do conteúdo"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          rows="6"
          placeholder="Cole conto, fanfic ou livro; a leitura fiel processa em trechos"
          aria-label="Texto do conteúdo"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="add-content-row">
          <p className="muted small">
            Sem limite de caracteres: textos longos são persistidos localmente e
            processados em chunks.
          </p>
          <button type="button" className="primary" onClick={handleAddText}>Adicionar texto</button>
        </div>
      </div>
    </details>
  );
}
