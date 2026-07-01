#!/usr/bin/env python3
"""Unit tests for the pause-based sentence segmentation in scripts/run-funasr.py.

Pure-logic tests: no funasr import, no model, no network. Runnable with any
Python 3.10+ interpreter, not just the FunASR venv.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

RUNNER_PATH = Path(__file__).resolve().parent.parent / "scripts" / "run-funasr.py"


def load_runner_module():
    spec = importlib.util.spec_from_file_location("run_funasr", RUNNER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load_runner_module()


def identity(text: str) -> str:
    return text


class JoinWordsTests(unittest.TestCase):
    def test_joins_chinese_characters_without_spaces(self):
        self.assertEqual(runner.join_words(["今", "天", "好"]), "今天好")

    def test_inserts_space_between_ascii_words(self):
        self.assertEqual(runner.join_words(["hello", "world"]), "hello world")

    def test_does_not_insert_space_between_mixed_scripts(self):
        self.assertEqual(runner.join_words(["RAG", "系统"]), "RAG系统")


class SentenceSegmentsFromWordsTests(unittest.TestCase):
    def test_splits_on_long_pauses(self):
        words = ["今", "天", "好", "。", "下", "午", "好", "。"]
        timestamps = [
            [90, 150], [210, 270], [450, 510], [690, 750],
            [2550, 2610], [2670, 2730], [2850, 2910], [3090, 3150],
        ]
        segments = runner.sentence_segments_from_words(
            words, timestamps, identity, max_segment_ms=15000,
        )
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["text"], "今天好。")
        self.assertEqual(segments[1]["text"], "下午好。")
        self.assertAlmostEqual(segments[0]["start"], 0.09)
        self.assertAlmostEqual(segments[0]["end"], 0.75)
        self.assertAlmostEqual(segments[1]["start"], 2.55)
        self.assertAlmostEqual(segments[1]["end"], 3.15)

    def test_splits_on_max_segment_length_even_without_a_pause(self):
        words = [str(i) for i in range(5)]
        timestamps = [[i * 1000, i * 1000 + 100] for i in range(5)]
        segments = runner.sentence_segments_from_words(
            words, timestamps, identity, max_segment_ms=2000,
        )
        self.assertGreater(len(segments), 1)

    def test_single_short_utterance_stays_one_segment(self):
        words = ["嗨"]
        timestamps = [[0, 200]]
        segments = runner.sentence_segments_from_words(
            words, timestamps, identity, max_segment_ms=15000,
        )
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["text"], "嗨")

    def test_empty_input_produces_no_segments(self):
        self.assertEqual(
            runner.sentence_segments_from_words([], [], identity, max_segment_ms=15000),
            [],
        )

    def test_real_sensevoice_word_timestamps_regression_fixture(self):
        # Captured from a real SenseVoiceSmall + fsmn-vad run on a synthetic
        # 3-sentence Chinese clip with ~1.5s silences between sentences.
        words = ["今", "天", "的", "天", "气", "非", "常", "好", "，", "我", "们", "决",
                  "定", "去", "公", "园", "散", "步", "。", "下", "午", "我", "们",
                  "讨", "论", "了", "这", "个", "项", "目", "的", "技", "术", "方",
                  "案", "和", "进", "度", "安", "排", "。", "最", "后", "，", "大",
                  "家", "一", "致", "同", "意", "先", "修", "复", "分", "段", "的",
                  "问", "题", "，", "再", "进", "行", "回", "归", "测", "试", "。"]
        timestamps = [
            [90, 150], [210, 270], [450, 510], [690, 750], [870, 930], [1230, 1290],
            [1350, 1410], [1590, 1650], [1890, 1950], [2130, 2190], [2310, 2370],
            [2490, 2550], [2670, 2730], [2910, 2970], [3210, 3270], [3390, 3450],
            [3630, 3690], [3870, 3930], [4110, 4170], [5550, 5610], [5850, 5910],
            [6090, 6150], [6270, 6330], [6390, 6450], [6630, 6690], [6810, 6870],
            [6990, 7050], [7170, 7230], [7350, 7410], [7530, 7590], [7710, 7770],
            [7950, 8010], [8070, 8130], [8370, 8430], [8550, 8610], [8730, 8790],
            [9030, 9090], [9210, 9270], [9450, 9510], [9630, 9690], [9870, 9930],
            [11430, 11490], [11730, 11790], [11850, 11910], [12030, 12090],
            [12210, 12270], [12510, 12570], [12630, 12690], [12930, 12990],
            [13050, 13110], [13290, 13350], [13590, 13650], [13770, 13830],
            [14070, 14130], [14250, 14310], [14430, 14490], [14610, 14670],
            [14790, 14850], [15030, 15090], [15330, 15390], [15750, 15810],
            [15930, 15990], [16230, 16290], [16410, 16470], [16710, 16770],
            [16890, 16950], [17130, 17190],
        ]
        segments = runner.sentence_segments_from_words(
            words, timestamps, identity, max_segment_ms=15000,
        )
        self.assertEqual(len(segments), 3)
        self.assertEqual(segments[0]["text"], "今天的天气非常好，我们决定去公园散步。")
        self.assertEqual(segments[1]["text"], "下午我们讨论了这个项目的技术方案和进度安排。")
        self.assertEqual(segments[2]["text"], "最后，大家一致同意先修复分段的问题，再进行回归测试。")


if __name__ == "__main__":
    unittest.main()
