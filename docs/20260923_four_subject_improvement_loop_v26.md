# 4科 自動改善ループ v2.6 — ローカル完成証跡

更新: 2026-09-23 JST
状態: LOCAL IMPLEMENTATION COMPLETE / PUBLICATION NOT YET AUTHORIZED

## 成果
- 4科の学習履歴を端末内で継続集計する `improvement-loop.js` を追加。
- 優先順位は「回収可能失点 → 期限超過 → 反復ミス → 所要時間 → 科目偏り」。
- 改善候補は最大3件。復習・回収がある間は難問追加を先にしない。
- 算数に加え、国語・理科・社会も今後の回答から所要時間を記録する。
- 理科は timestamp 付き `attemptLog` を追加し、直近7/14日を厳密集計。旧端末データは累計 history へ安全にfallback。
- 最大28日分の匿名集計snapshotのみ保存。問題ID・答案・氏名はsnapshot/capsuleへ保存しない。
- 保護者画面に「4科 自動改善ループ」を追加し、匿名改善カプセルとCodex READYを生成可能。
## Codex連携
- `codexReadyText()` は同じsnapshotから同一Task ID/同一内容を決定的に生成。
- Task IDは `AI-EVAL-OPS-FOUR-SUBJECT-QUALITY-YYYYMMDD-<fingerprint>`。
- AI_EVAL_OPS v33の `AI_EVAL_OPS_EVALUATOR_REQUEST` と `AI_EVAL_OPS_EVIDENCE_RESULT` を含む。
- operation_type は canonical `bounded_local_edit`。
- AI_EVAL_OPS現行parserで `VALID` を実測確認。
- READYは commit / push / deploy / network / system setting change を禁止する。

## 検証
- improvement-loop focused tests: 18/18 PASS
- existing adaptive-quality: 24/24 PASS
- root cache contract: 4/4 PASS
- math home diversity: 11/11 PASS
- syntax checks: root dashboard + 国語/理科/社会変更JS/SW PASS
- local-runtime build: PASS
- local-runtime validate: PASS
- 438 unique questions / 30 generated families / 52 weeksを維持
- root app payload bytes unchanged
- `git diff --check`: PASS

## 未実施
commit / push / GitHub Pages deploy は明示承認前なので未実施。公開版はまだ旧版。
