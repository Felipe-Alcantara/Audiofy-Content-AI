"""Contrato de nomes autoexplicativos e migração sem regeneração."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.artifact_migration import migrate_episode_artifacts  # noqa: E402
from audiofy.artifacts import (  # noqa: E402
    final_audio_filename,
    segment_audio_filename,
    source_document_filename,
)
from audiofy.sources.base import ContentItem  # noqa: E402


class ArtifactNamingTest(unittest.TestCase):
    def test_nomes_identificam_fonte_episodio_modo_completude_chunk_e_voz(self):
        final = final_audio_filename("Conteúdo próprio", "2026/Meu Livro", "verbatim")
        source = source_document_filename("Conteúdo próprio", "2026/Meu Livro")
        chunk = segment_audio_filename(
            "Conteúdo próprio", "2026/Meu Livro", "verbatim", 2, 120, "Orus", ".wav"
        )

        self.assertEqual(
            final,
            "fonte-conteudo-proprio__episodio-2026-meu-livro"
            "__modo-leitura-fiel__audio-completo.mp3",
        )
        self.assertTrue(source.endswith("__fonte-original-completa.md"))
        self.assertTrue(chunk.endswith("__chunk-002-de-120__voz-orus.wav"))
        self.assertNotIn("/", final)


class ArtifactMigrationTest(unittest.TestCase):
    def test_migra_audio_e_manifestos_sem_alterar_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / "2026-07-18-livro"
            segments = directory / "segments"
            segments.mkdir(parents=True)
            (directory / "episode.mp3").write_bytes(b"audio-completo")
            (segments / "001_narrador.wav").write_bytes(b"chunk-1")
            (segments / "002_narrador.wav").write_bytes(b"chunk-2")
            (directory / "status.json").write_text(
                json.dumps({"episode_id": "2026-07-18-livro"}), encoding="utf-8"
            )
            (directory / "narration-script.json").write_text(
                json.dumps(
                    {
                        "turns": [
                            {"speaker": "narrador", "text": "um"},
                            {"speaker": "narrador", "text": "dois"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (directory / "segments.json").write_text(
                json.dumps({"segments": {"001_narrador.wav": {"fingerprint": "abc"}}}),
                encoding="utf-8",
            )
            (directory / "audio-audit.json").write_text(
                json.dumps(
                    {
                        "summary": {"segments": 2},
                        "segments": [{"file": "001_narrador.wav"}],
                    }
                ),
                encoding="utf-8",
            )
            (directory / "metrics.json").write_text(
                json.dumps({"generation_mode": "verbatim"}), encoding="utf-8"
            )
            item = ContentItem(
                item_id="2026-07-18-livro",
                title="Livro",
                url="",
                published_at="2026-07-18",
                text="texto \nintegral \n",
                words=2,
                attribution="Conteúdo próprio",
            )

            result = migrate_episode_artifacts(directory, item=item, source_key="custom")

            migrated_segments = sorted(segments.iterdir())
            manifest = json.loads((directory / "segments.json").read_text(encoding="utf-8"))
            audit = json.loads((directory / "audio-audit.json").read_text(encoding="utf-8"))
            metrics = json.loads((directory / "metrics.json").read_text(encoding="utf-8"))
            legacy_exists = (directory / "episode.mp3").exists()
            final_bytes = (directory / result["final_audio"]).read_bytes()
            segment_bytes = [path.read_bytes() for path in migrated_segments]
            source_exists = (directory / result["source_file"]).is_file()
            source_document = (directory / result["source_file"]).read_text(encoding="utf-8")

        self.assertFalse(legacy_exists)
        self.assertEqual(final_bytes, b"audio-completo")
        self.assertEqual(segment_bytes, [b"chunk-1", b"chunk-2"])
        self.assertTrue(all("__chunk-" in path.name for path in migrated_segments))
        self.assertEqual(set(manifest["segments"]), {path.name for path in migrated_segments})
        self.assertEqual(audit["segments"][0]["file"], migrated_segments[0].name)
        self.assertEqual(metrics["final_audio_file"], result["final_audio"])
        self.assertEqual(metrics["source_key"], "custom")
        self.assertTrue(source_exists)
        self.assertNotIn(" \n", source_document)


if __name__ == "__main__":
    unittest.main()
