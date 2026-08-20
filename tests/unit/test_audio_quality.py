"""Auditoria de qualidade sonora: volume, brilho e queda dentro do trecho."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.audio_quality import (  # noqa: E402
    BRIGHTNESS_DROP_LIMIT,
    SegmentQuality,
    audit_quality,
    avaliar_episodio,
    medir_segmento,
    read_quality_report,
)


def _quadros(pares):
    """Saída do ffprobe no formato ``rms,centroide`` por quadro."""
    return SimpleNamespace(stdout="\n".join(f"{rms},{centro}" for rms, centro in pares))


class MedicaoDeSegmentoTest(unittest.TestCase):
    """A medição precisa ignorar silêncio: o brilho de um quadro mudo é ruído."""

    @patch("audiofy.audio_quality.media_duration_seconds", return_value=30.0)
    @patch("audiofy.audio_quality.run_tool")
    def test_ignora_quadros_sem_fala_ao_medir_brilho(self, run_tool, _duracao):
        # Silêncio com brilho altíssimo no início; fala real em 1000 Hz.
        run_tool.return_value = _quadros(
            [(-70.0, 9000.0)] * 10 + [(-20.0, 1000.0)] * 20 + [(-70.0, 9000.0)] * 10
        )

        medida = medir_segmento(Path("chunk.wav"))

        self.assertAlmostEqual(medida.brightness_hz, 1000.0, places=1)
        self.assertAlmostEqual(medida.level_dbfs, -20.0, places=1)

    @patch("audiofy.audio_quality.media_duration_seconds", return_value=30.0)
    @patch("audiofy.audio_quality.run_tool")
    def test_mede_a_queda_de_brilho_do_inicio_ao_fim(self, run_tool, _duracao):
        # Começa em 1200 Hz e termina em 600: metade do brilho.
        run_tool.return_value = _quadros(
            [(-20.0, 1200.0)] * 30 + [(-20.0, 900.0)] * 30 + [(-20.0, 600.0)] * 30
        )

        medida = medir_segmento(Path("chunk.wav"))

        self.assertAlmostEqual(medida.brightness_drop, 0.5, places=2)

    @patch("audiofy.audio_quality.media_duration_seconds", return_value=30.0)
    @patch("audiofy.audio_quality.run_tool")
    def test_trecho_sem_fala_nao_inventa_numero(self, run_tool, _duracao):
        run_tool.return_value = _quadros([(-80.0, 500.0)] * 30)

        medida = medir_segmento(Path("chunk.wav"))

        self.assertIsNone(medida.brightness_hz)
        self.assertIsNone(medida.brightness_drop)

    @patch("audiofy.audio_quality.media_duration_seconds", return_value=30.0)
    @patch("audiofy.audio_quality.run_tool")
    def test_valores_invalidos_do_ffmpeg_nao_derrubam_a_medicao(self, run_tool, _duracao):
        linhas = ["-inf,nan", "lixo", "", "-20.0,1000.0 "] + ["-20.0,1000.0"] * 12
        run_tool.return_value = SimpleNamespace(stdout="\n".join(linhas))

        medida = medir_segmento(Path("chunk.wav"))

        self.assertAlmostEqual(medida.brightness_hz, 1000.0, places=1)


class AvaliacaoDoEpisodioTest(unittest.TestCase):
    """Os limiares são relativos ao próprio episódio.

    Brilho absoluto muda com a voz — uma voz grave é naturalmente mais escura
    que uma aguda. O que denuncia defeito é o trecho destoar dos outros do
    mesmo episódio, ou decair de dentro para fora.
    """

    def _medida(self, indice, brilho, nivel, queda=0.0):
        return SegmentQuality(
            file=f"chunk-{indice:03d}.wav",
            chunk_index=indice,
            duration_seconds=30.0,
            level_dbfs=nivel,
            brightness_hz=brilho,
            brightness_drop=queda,
        )

    def test_marca_queda_de_brilho_dentro_do_trecho(self):
        medidas = [self._medida(i, 1200.0, -18.0) for i in range(1, 5)]
        medidas[2] = self._medida(3, 1200.0, -18.0, queda=BRIGHTNESS_DROP_LIMIT + 0.1)

        avaliadas, resumo = avaliar_episodio(medidas)

        self.assertIn("queda_de_brilho", avaliadas[2].issues)
        self.assertEqual(avaliadas[2].severity, "atencao")
        self.assertEqual(resumo["com_problema"], 1)
        self.assertEqual([m.severity for m in avaliadas[:2]], ["ok", "ok"])

    def test_marca_trecho_abafado_em_relacao_ao_episodio(self):
        medidas = [self._medida(i, 1200.0, -18.0) for i in range(1, 5)]
        medidas[1] = self._medida(2, 700.0, -18.0)

        avaliadas, _ = avaliar_episodio(medidas)

        self.assertIn("voz_abafada", avaliadas[1].issues)

    def test_marca_trecho_mais_baixo_que_o_episodio(self):
        medidas = [self._medida(i, 1200.0, -18.0) for i in range(1, 5)]
        medidas[3] = self._medida(4, 1200.0, -26.0)

        avaliadas, _ = avaliar_episodio(medidas)

        self.assertIn("volume_baixo", avaliadas[3].issues)

    def test_voz_grave_inteira_nao_vira_problema(self):
        """Um episódio todo escuro é escolha de voz, não defeito de trecho."""
        medidas = [self._medida(i, 700.0, -18.0) for i in range(1, 6)]

        avaliadas, resumo = avaliar_episodio(medidas)

        self.assertEqual(resumo["com_problema"], 0)
        self.assertTrue(all(m.severity == "ok" for m in avaliadas))

    def test_episodio_curto_demais_nao_gera_falso_positivo(self):
        """Com um ou dois trechos não há mediana confiável para comparar."""
        avaliadas, resumo = avaliar_episodio([self._medida(1, 1200.0, -18.0)])

        self.assertEqual(resumo["com_problema"], 0)
        self.assertEqual(avaliadas[0].severity, "ok")


class RelatorioTest(unittest.TestCase):
    @patch("audiofy.audio_quality.medir_segmento")
    def test_grava_e_le_o_relatorio_do_episodio(self, medir):
        medir.side_effect = lambda caminho: SegmentQuality(
            file=caminho.name,
            chunk_index=0,
            duration_seconds=30.0,
            level_dbfs=-18.0,
            brightness_hz=500.0 if "005" in caminho.name else 1200.0,
            brightness_drop=0.0,
        )
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            caminhos = [directory / f"chunk-{i:03d}.wav" for i in range(1, 6)]

            relatorio = audit_quality(directory, caminhos)
            relido = read_quality_report(directory)

        self.assertEqual(relatorio["summary"]["total"], 5)
        self.assertEqual(relatorio["summary"]["com_problema"], 1)
        self.assertEqual(relatorio["summary"]["trechos_com_problema"], [5])
        self.assertEqual(relido["summary"], relatorio["summary"])
        gravado = json.dumps(relatorio)  # precisa ser serializável
        self.assertIn("voz_abafada", gravado)


if __name__ == "__main__":
    unittest.main()
