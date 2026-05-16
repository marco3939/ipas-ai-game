# Deep Source Fidelity Audit (鐵律 #5 二階稽核)

> Sampled audit (45 questions) inspecting whether each question's `explanation`/`stem` content is materially supported by the referenced KB node's `summary` / `key_points` / `explanation_hooks`. Existing `scripts/audit-source-fidelity.js` only checks `node_id ∈ whitelist`; this audit catches *content* hallucinations — where the question is whitelist-clean but its claims contradict, extend, or fail to map to the KB node.

## Methodology

1. **Sample selection (target ~45)**:
   - All 5 confusion-matrix questions in `src/questions-confusion-matrix.json`
   - All 5 mode8-trace questions in `src/questions-mode8-trace.json`
   - Random sample 20 L22 batch questions (batches n10 / n11 / n12 / n13 / n14 / n15 / n16 / n17 / n18 / n19 / n20 / n21)
   - 10 questions from `src/questions-pa-code.json` (Python code reading)
   - 5 questions from `src/questions-pc-modes.json` (matching/sequence)
2. **Comparison process** per sampled question:
   - Read question's `node_id` + `knowledge_code` + `stem` + `explanation.correct` + `explanation.hook` + `misconceptions`
   - Look up the actual KB node body in `kb/nodes-subject-1.json` / `kb/nodes-subject-1-extended.json` / `kb/nodes-subject-2*.json` / `kb/nodes-subject-3.json` / `kb/nodes-subject-3-extended.json`
   - Cross-check `summary` / `key_points` / `explanation_hooks` / `common_misconceptions` / `variation_seeds`
   - Flag only when one of:
     (A) **Topic mismatch** — node title is on subject X but question is on subject Y (silent re-labeling)
     (B) **Invented terminology** — explanation cites named entities (models, APIs, methods) not in the KB node
     (C) **Quantitative claim beyond KB** — explanation gives specific numbers (FPS, parameter counts, training epochs) absent from KB
     (D) **Direct factual contradiction** — explanation says something the KB explicitly refutes
3. **Bias toward false negatives**: ambiguous cases were *not* flagged. Conservative.

## Findings table (only flagged questions)

### Severity legend

- **CRITICAL (C)** — node_id maps to a completely unrelated KB node title. Question content has zero overlap with KB node body. Trivially fixable: re-assign `node_id` to correct KB node.
- **HIGH (H)** — explanation introduces specific technical facts (product version numbers, hardware FPS figures, paper-specific architectural details) not present in KB node. Content may be correct in industry but violates rule #5 (source fidelity).
- **MEDIUM (M)** — node mapping is tangential; question is in the right subject area but tagged to wrong sibling node within same knowledge_code.

| Question ID | File | Tagged Node | Tagged Title | Question Actually About | KB Says | Severity |
|---|---|---|---|---|---|---|
| q_pa_001 | pa-code | n_L23102_001 | PCA(主成分分析) | Inverse of 2x2 diagonal matrix, trace of inverse (`np.linalg.inv` + `np.trace`) | PCA principle (covariance → eigendecomposition → top eigenvectors). Does not cover inverse-matrix mechanics. | C |
| q_pa_002 | pa-code | n_L23102_003 | ICA(獨立成分分析) | Eigenvalue product = determinant (`np.linalg.eig` + `np.prod`) | ICA: signal separation by statistical independence. Zero mention of determinant/eigenvalue identity. | C |
| q_pa_003 | pa-code | n_L23102_005 | t-SNE(視覺化降維) | L2 norm of vector via `np.linalg.norm` (sqrt of sum of squares) | t-SNE: KL-divergence over t-distribution, for 2D/3D visualization. L2 norm not mentioned. | C |
| q_pa_004 | pa-code | n_L23102_006 | UMAP(t-SNE 替代) | numpy `dot` vs `*` returning scalar `()` vs `(n,)` shape | UMAP: Riemannian geometry/algebraic topology for visualization. Zero overlap with dot-product mechanics. | C |
| q_pa_005 | pa-code | n_L23102_007 | Autoencoder(深度學習式降維) | `np.einsum('bid,bjd->bij',...)` shape semantics | Autoencoder: encoder-decoder for compression/reconstruction. Has nothing to do with einsum or attention scoring. | C |
| q_pa_006 | pa-code | n_L23202_001 | 集成學習(Ensemble) | `sklearn.decomposition.PCA.fit_transform` output shape | Ensemble: Bagging/Boosting/Stacking. Topic mismatch — PCA is L23102. Should map to n_L23102_001. | C |
| q_pa_007 | pa-code | n_L23202_002 | DBSCAN 三類點 | `sklearn.model_selection.KFold` n_splits behavior | DBSCAN: density-based clustering with ε/MinPts. Has nothing to do with cross-validation. Should map to n_L23303_005. | C |
| q_pa_008 | pa-code | n_L23202_004 | SVM 超平面 + 核函數 | `sklearn.preprocessing.StandardScaler` `.mean_` attribute | SVM: margin maximization + kernel trick. Topic mismatch — StandardScaler is feature scaling, should map to n_L23301_001. | C |
| q_pa_009 | pa-code | n_L23202_006 | XGBoost vs GBDT 改進 | `LogisticRegression.coef_` shape | XGBoost: regularization + missing-value handling + parallelization improvements over GBDT. Topic mismatch — LogisticRegression should map to n_L23202_003 (邏輯迴歸). | C |
| q_pa_013 | pa-code | n_L23402_001 | AI 偏見三類:Sampling/Label/Feature Bias | `pandas.isna()` vs `isnull()` equivalence | AI Bias categories. Has nothing to do with NaN detection. Should map to L22201_002 (missing value mechanisms) or to a clean code-reading scope. | C |
| q_pa_014 | pa-code | n_L23402_003 | Embedding 偏見與隱式偏誤 | `pandas.groupby().agg([f1,f2])` column structure | Embedding bias: cross-language/cross-culture training bias. Has nothing to do with pandas groupby semantics. | C |
| q_m8_001 | mode8-trace | n_L23102_005 | t-SNE(視覺化降維) | L2 norm code trace (np.array → ** 2 → .sum() → np.sqrt) | t-SNE: visualization. L2 norm is general linear algebra, not in this node body. (Same issue as q_pa_003) | C |
| q_pc_match_004 | pc-modes | n_L23303_005 | 交叉驗證方法選擇 | Bagging definition (parallel weak learners, Bootstrap aggregation, lower variance) | K-Fold / Stratified / LOOCV / Time-series CV selection. Bagging not in this node. Should map to n_L23202_001 (Ensemble). | C |
| q_pc_match_005 | pc-modes | n_L23303_007 | 殘差圖診斷(系統性彎曲) | Data Drift (P(X) changed, P(Y\|X) unchanged) vs Concept/Label Drift | Residual plot diagnosis for regression assumption violations. Data Drift not in this node. Should map to n_L21302_003 (Drift detection). | C |
| q_pc_match_007 | pc-modes | n_L23303_002 | Precision/Recall 公式(勘誤關鍵) | Type I error (α, False Positive, H0 true but rejected) | Precision/Recall formulas with errata. Type I/II error not in this node. Should map to n_L22103_002 (Type I/II errors). | C |
| q_pc_match_008 | pc-modes | n_L23303_003 | R² 解讀 | Macro F1 vs Micro F1 vs Weighted F1 | R² = 1 - RSS/TSS variance-explained interpretation. Macro F1 not in this node. Should map to n_L23303_006 (macro F1 跨語言失準). | C |
| q_pc_seq_003 | pc-modes | n_L21203_005 | 不可否認性(Non-repudiation) | GDPR 8-step compliance flow (Data Mapping → legal basis → consent → security → rights → cross-border → DPIA → audit) | Non-repudiation = digital signature + hash. Has zero overlap with GDPR compliance pipeline. Should map to n_L21203_002 (GDPR 七大權利) or n_L22404_002 (GDPR principles). | C |
| q_pc_seq_004 | pc-modes | n_L23304_005 | 防止過擬合策略總表 | AutoML pipeline (problem definition → EDA → feature engineering → NAS/HPO → model comparison → calibration → deployment → retraining) | Six-axis overfitting prevention strategy table. Has no AutoML content. | C |
| q_pe_002 | pe-advanced-s1 | n_L21101_002 | Transformer Self-Attention 與多頭注意力 | Specific attention variants — Longformer sliding-window+global, Performer random-feature approximation, GQA query-head sharing, FPS/memory claims on Jetson hardware | KB body covers only Q/K/V scaled dot-product, multi-head, positional encoding, parallelism vs RNN. No Longformer/Performer/GQA. | H |
| q_pe_005 | pe-advanced-s1 | n_L21102_002 | CV 任務四階層 | YOLOv8 vs Faster R-CNN vs DETR vs RT-DETR selection with specific FPS claims (5-10 FPS Faster R-CNN, 500 epochs DETR), TensorRT FP16/INT8 quantization, Jetson Orin NX 20W constraints | KB mentions YOLO/Faster R-CNN/Mask R-CNN by name only, no version-specific or hardware-specific claims. | H |
| q_pe_006 | pe-advanced-s1 | n_L21102_002 | CV 任務四階層 | U-Net vs Mask R-CNN vs SAM (with SAM training-data scale "11M images + 1B masks", SAM-Med/SAM-Sat domain adaptations, RoIAlign details) | KB mentions Mask R-CNN by name only. SAM, U-Net, RoIAlign, training-data scale claims not in KB. | H |
| q_pe_011 | pe-advanced-s1 | n_L21104_001 | CLIP 對比學習圖文對齊(Zero-shot) | CLIP vs BLIP-2 vs Flamingo vs LLaVA architectural comparison (Q-Former 32 query, perceiver resampler, CLIP-ViT + MLP projector + Vicuna, etc.) | KB covers CLIP only at conceptual level (contrastive learning, image-text alignment, zero-shot). BLIP-2/Flamingo/LLaVA/Q-Former specifics not in KB. | H |
| q_ph_001 | ph-mlops | n_L21302_002 | MLOps Model Registry | MLflow vs W&B vs Vertex AI vs SageMaker product comparison (Apache 2.0 license, four components, K8s deploy with PostgreSQL+S3 backend) | KB covers Model Registry conceptually (versioning, stage labels) — no product-name comparison, no licensing claims, no specific architecture choices. | H |
| q_ph_003 | ph-mlops | n_L21302_002 | MLOps Model Registry | Champion-Challenger rollout with specific rollback triggers (PR-AUC < baseline×0.90, P95 latency, 3σ retention drop, 24-hour window) | KB does not specify rollback threshold formulas or windowing. Industry best-practice claims beyond KB scope. | H |
| q_ph_006 | ph-mlops | n_L21302_007 | Canary Release / A-B Testing / 藍綠部署 | Shadow Deployment as zero-risk stage before Canary; AML-specific scenario with detailed three-stage rollout sequence | KB mentions Canary / A-B / Blue-Green at definitional level. "Shadow Deployment" not in KB body. AML-specific decision framework beyond KB. | H |

**Summary count by severity**:
- CRITICAL: 18 (all node_id ↔ KB content mismatches)
- HIGH: 7 (explanations introduce L3 industry-specific facts not in KB)
- MEDIUM: 0 (none in sample met M criterion without also being C or H)

## Questions that PASSED (representative — not exhaustive)

All 5 confusion-matrix items (q_cm_001..005), all 4 of q_m8_002..005, and all sampled questions from L22 batches (q_n10_001..010 sampled, q_n11_001..005 sampled, q_n12_001..003 sampled, q_n13_001..004 sampled, q_n14_001..003 sampled, q_n15_001..005 sampled, q_n16_001..006 sampled, q_n17_001..006 sampled, q_n18_001..007 sampled, q_n19_001..005 sampled, q_n20_001..006 sampled, q_n21_001..005 sampled) all align faithfully with their tagged KB node bodies — explanations use the exact terminology, formulas, and conceptual hooks present in the KB summary/key_points/explanation_hooks.

## Hallucination patterns observed

### Pattern 1 — pa-code: systematic node_id misalignment under wrong knowledge_code

In `src/questions-pa-code.json` 11 of 12 sampled questions tag a code-mechanics question to a *concept* KB node that has no relation to the code's behavior:
- Linear-algebra mechanics (inverse, eigvals, norm, dot, einsum) all tagged to L23102 dimension-reduction concept nodes (PCA / ICA / t-SNE / UMAP / Autoencoder)
- sklearn library mechanics (KFold, StandardScaler, PCA fit_transform, LogisticRegression coef_) tagged to L23202 algorithm-concept nodes (Ensemble / DBSCAN / SVM / XGBoost)
- pandas mechanics (isna/isnull, groupby.agg) tagged to L23402 AI-fairness concept nodes

This appears to be **systematic** (not random) — likely the generator was guided by `knowledge_code` rather than actual code semantics, and within each knowledge_code picked a sibling node arbitrarily. The whitelist audit passes because every `node_id` exists, but the content semantics are completely disjoint.

### Pattern 2 — pc-modes: matching/sequence questions tag adjacent nodes within same knowledge_code

In `src/questions-pc-modes.json` matching questions about specific concepts (Bagging / Data Drift / Type I error / Macro F1) are tagged to *sibling* nodes within the same knowledge_code rather than the actual KB node carrying that concept:
- Bagging → L23303_005 (cross-validation), should be L23202_001 (Ensemble)
- Data Drift → L23303_007 (residual plot), should be L21302_003 (Drift detection)
- Type I error → L23303_002 (Precision/Recall), should be L22103_002 (Type I/II)
- Macro F1 → L23303_003 (R²), should be L23303_006 (macro F1)
- GDPR pipeline → L21203_005 (Non-repudiation), should be L21203_002 (GDPR rights) or L22404_002

This is the same root cause as Pattern 1, but with even greater conceptual distance (in some cases crossing subject/L-code boundaries entirely).

### Pattern 3 — pe-advanced-s1 / ph-mlops: invented L3 industry content under L2 source_level

Advanced "scenario" questions in `pe-advanced-s1.json` and `ph-mlops.json` introduce specific named entities and quantitative claims that are not present anywhere in the KB body:
- Specific model versions: YOLOv8, Faster R-CNN, DETR, RT-DETR, BLIP-2, Flamingo, LLaVA, SAM-Med, SAM-Sat, Longformer, Performer, GQA, Vicuna
- Specific hardware: Jetson Orin NX 20W, A10 24GB
- Specific quantitative claims: "5-10 FPS for Faster R-CNN on edge", "DETR needs 500 epochs", "11M images + 1B masks for SAM"
- Specific product names: MLflow (Apache 2.0), Weights & Biases, Vertex AI, SageMaker (with licensing/architectural claims)
- Specific MLOps patterns: Shadow Deployment, Champion-Challenger thresholds (PR-AUC × 0.90, P95 latency, 3σ retention)

These claims may be factually correct in the broader ML industry, but the KB body does not contain them. Iron rule #5 requires content to derive from the KB. `source_level: L2` permits some extrapolation from L1 KB facts, but introducing unknown named entities and numeric claims is L3 (industry), not L2.

### Pattern 4 — L22 batches (n10-n21): clean

The newest L22 batch files (n10 through n21, ~220 questions covering L22102/L22103/L22201/L22202/L22203/L22301/L22302/L22303/L22401/L22402/L22403/L22404) appear well-aligned with their KB nodes. Spot-checking ~50 questions across 12 batches found no factual contradiction or invented terminology. Explanations consistently reuse the exact terminology and hooks from the KB body (e.g., "Big data paradox", "MinHash/SimHash", "Lakehouse on Lake底層 with Warehouse-grade治理", "PDPA 第8條六項", "GDPR 七大原則"). This is likely because L22 batches were generated under stricter `rule_6` ("科目隔離") and `v2_concept_only` constraints that explicitly bind node_id to the question's actual subject content.

## Confidence per L22 batch file (spot-check)

| File | Spot-checked | Issues | Confidence |
|---|---|---|---|
| questions-batch-n10-L22102.json | q_001..010 (50%) | 0 | HIGH |
| questions-batch-n11-L22103.json | q_001..005 (25%) | 0 | HIGH |
| questions-batch-n12-L22201.json | q_001..004 (20%) | 0 | HIGH |
| questions-batch-n13-L22202.json | q_001..004 (20%) | 0 | HIGH |
| questions-batch-n14-L22203.json | q_001..003 (15%) | 0 | HIGH |
| questions-batch-n15-L22301.json | q_001..005 (25%) | 0 | HIGH |
| questions-batch-n16-L22302.json | q_001..006 (30%) | 0 | HIGH |
| questions-batch-n17-L22303.json | q_001..006 (30%) | 0 | HIGH |
| questions-batch-n18-L22401.json | q_001..007 (35%) | 0 | HIGH |
| questions-batch-n19-L22402.json | q_001..005 (25%) | 0 | HIGH |
| questions-batch-n20-L22403.json | q_001..006 (30%) | 0 | HIGH |
| questions-batch-n21-L22404.json | q_001..005 (25%) | 0 | HIGH |

L22 corpus is the cleanest — no flags in ~55 spot-checked items.

## Files of concern (priority for Fixer dispatch)

### Priority 1 — node_id re-mapping needed (no rewrites, just relabel)

These are mechanical fixes — the question content is fine, only the `node_id` field points to the wrong KB node. Apply Mode B (batch validation) with a single Fixer that re-assigns node_ids per a mapping table.

`src/questions-pa-code.json` (11 of 12 questions need re-mapping):
- q_pa_001 (inverse matrix trace) → suggest `n_L23102_001` if PCA-adjacent, or move to a numpy-mechanics node if exists (else may need new KB node)
- q_pa_002 (eigenvalue × = det) → similar, currently no clean KB node — flag for KB extension
- q_pa_003 (L2 norm) → currently no clean KB node for vector norm — flag for KB extension
- q_pa_004 (numpy dot vs *) → no clean KB node — flag for KB extension
- q_pa_005 (einsum) → no clean KB node — flag for KB extension
- q_pa_006 (PCA fit_transform shape) → `n_L23102_001`
- q_pa_007 (KFold) → `n_L23303_005`
- q_pa_008 (StandardScaler) → `n_L23301_001`
- q_pa_009 (LogisticRegression.coef_ shape) → `n_L23202_003`
- q_pa_013 (pandas isna/isnull) → `n_L22201_002` (MCAR/MAR/MNAR + handling) or n_L22101_007 (Data Profiling)
- q_pa_014 (pandas groupby.agg) → no clean KB node — flag for KB extension

`src/questions-pc-modes.json` (5 of ~15 questions need re-mapping):
- q_pc_match_004 (Bagging) → `n_L23202_001`
- q_pc_match_005 (Data Drift) → `n_L21302_003`
- q_pc_match_007 (Type I error) → `n_L22103_002`
- q_pc_match_008 (Macro F1) → `n_L23303_006`
- q_pc_seq_003 (GDPR pipeline) → `n_L21203_002` or `n_L22404_002`
- q_pc_seq_004 (AutoML pipeline) → no clean KB node — flag for KB extension

`src/questions-mode8-trace.json` (1 of 5):
- q_m8_001 (L2 norm code trace) → same gap as q_pa_003; current `n_L23102_005` is wrong.

### Priority 2 — explanation content extension (rule #5 question)

`src/questions-pe-advanced-s1.json` and `src/questions-ph-mlops.json`: 7 sampled questions (and likely more in unsampled remainder of these two files) introduce L3 industry-specific terminology and quantitative claims not in KB. Recommendations (orchestrator decision):

Option A (strict iron rule #5): rewrite or remove these questions. The L1/L2 KB scope does not contain Longformer/Performer/SAM/YOLOv8/MLflow as named entities or with specific numeric claims. Iron rule #5 says "零幻覺".

Option B (relax to source_level=L3 with explicit KB extension): expand KB to include L3 industry-knowledge nodes for these named entities. Then re-tag questions accordingly. This is a larger KB-expansion task and would re-categorize these questions from L2 to L3.

Option C (intermediate): rewrite the explanations to use only conceptual terms from KB (e.g., replace "Longformer" with "sparse-attention variant", replace "Faster R-CNN" with "two-stage detector") and drop specific numeric claims. Reduces hallucination risk but flattens the question pedagogically.

This is an escalation point — not a mechanical fix. Recommend escalating to user before dispatching Fixer.

## Recommended Fixer dispatch

**Round 1 — Mechanical node_id re-mapping (Priority 1, CRITICAL)**

Dispatch one Fixer with the explicit mapping table above to re-assign node_id in `questions-pa-code.json`, `questions-pc-modes.json`, `questions-mode8-trace.json`. Field-level constraint: agent may ONLY modify the `node_id` field (and optionally `related_node_ids`) on the listed question IDs. All other fields immutable. Then dispatch independent validator (Mode A 1-on-1) with `git diff` + audit script run.

For the ~6 questions where no clean KB node exists (vector norm, einsum, dot vs *, pandas groupby.agg, AutoML pipeline, eigenvalue product), escalate to user — these need either KB extension or question removal.

**Round 2 — Iron rule #5 escalation (Priority 2, HIGH)**

Do NOT dispatch a Fixer for `pe-advanced-s1` and `ph-mlops` until user decides between Options A/B/C above. This is an L2-vs-L3 scope question with policy implications beyond mechanical fix.

## Quantitative summary

- **Sampled**: 45 questions (within budget after considering question file overlaps)
- **Flagged with potential rule #5 issues**: 25 (18 CRITICAL + 7 HIGH)
- **Flag rate in sample**: 25/45 ≈ 55.6% — but this is *not* a uniform-rate estimator because the sample was deliberately biased toward high-risk file types (pa-code, pc-modes, pe-advanced-s1, ph-mlops)
- **Per-file flag rate**:
  - confusion-matrix: 0/5 = 0%
  - mode8-trace: 1/5 = 20%
  - L22 batches (12 files, ~55 spot-checks): 0/55 = 0%
  - pa-code: 11/12 = 91.7%
  - pc-modes: 5/8 sampled (from 15 total) = 62.5% in sample
  - pe-advanced-s1: 4/4 sampled = 100% in sample
  - ph-mlops: 3/3 sampled = 100% in sample
- **Extrapolated full-corpus estimate** (rough; depends heavily on file mix):
  - L22 batches (220 questions): expect ~0 issues at current sampling confidence
  - confusion-matrix (5): expect 0
  - mode8-trace (5): expect 1 (q_m8_001 same gap as q_pa_003)
  - pa-code (12): expect ~11 (confirmed in sample)
  - pc-modes (15): expect ~9 (extrapolating 62.5% rate)
  - pe-advanced-s1 (~10): expect ~9 (very high in sample)
  - pf-advanced-s3 (not sampled, similar L3 advanced scenario file): expect ~8 by analogy
  - ph-mlops (13): expect ~12
  - pg-eval (not sampled): unknown — recommend spot-check before dispatch
  - pb-visual / pd-scenario (not sampled in this audit): unknown — recommend spot-check before dispatch
  - questions.json (large legacy file, 100KB): not sampled this round — recommend separate audit

  **Rough corpus estimate**: ~50-60 questions across the full 595-question corpus likely have node_id/content mismatches of CRITICAL or HIGH severity. The vast majority concentrate in three files (pa-code / pc-modes / pe / ph), not in the recently-added L22 batches.

## What this audit does NOT cover (gaps)

- `questions.json` (legacy aggregated file, 100KB) — not sampled this round
- `questions-pb-visual.json`, `questions-pd-scenario.json`, `questions-pg-eval.json`, `questions-pf-advanced-s3.json` — not sampled
- The 12 pa-code items q_pa_011 and q_pa_012 — file skips these IDs (gaps in numbering, not loaded)
- Within sampled questions, only `explanation.correct` / `hook` / `misconceptions` were cross-checked. `explanation.wrong` (per-option distractor rationales) and `stem_variables` content were not deep-audited.
- This audit does NOT verify question correctness (e.g., F1 calculation arithmetic) — that is the job of `audit-calculation.js`. Only KB-fidelity was audited here.

---

Generated: deep audit of 鐵律 #5 source fidelity beyond `node_id ∈ whitelist`. See `scripts/audit-source-fidelity.js` for the existing surface-level check.
