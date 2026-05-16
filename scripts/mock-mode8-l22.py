"""
mock-mode8-l22.py — 獨立驗算 q_m8_016..q_m8_027 共 12 題 L22 trace 的數值正確性

對每題的每 case,重跑題目背後的計算邏輯,assert 與 trace_steps[*].is_correct=true 的選項文字一致。

exit 0 = 全 PASS(12 題 × 3 case × ≥3 step = 至少 108 個 assert);exit 1 = 任一 fail
"""
import json
import math
import sys
import io
from pathlib import Path

ROOT = Path(__file__).parent.parent
QFILE = ROOT / 'src' / 'questions-mode8-trace.json'

data = json.loads(QFILE.read_text(encoding='utf-8'))
qmap = {q['id']: q for q in data['questions']}

# ---- helper ----------------------------------------------------------------
def correct_of(qid, after_line):
    """Return the is_correct=true option's text (with placeholder unsubbed)
    for the trace_step matching this after_line."""
    q = qmap[qid]
    for step in q['trace_steps']:
        if step['after_line'] == after_line:
            for o in step['options']:
                if o.get('is_correct'):
                    return o['text']
    raise KeyError(f"{qid}: no step with after_line={after_line}")

def substitute(text, case):
    for k, v in case.items():
        text = text.replace('{' + k + '}', str(v))
    return text

def check(qid, case_label, after_line, expected_text, actual_text):
    case = qmap[qid]['stem_variables'][case_label]
    exp = substitute(correct_of(qid, after_line), case)
    if exp != expected_text:
        raise AssertionError(
            f"{qid} {case_label} after_line={after_line}: "
            f"JSON expects {exp!r} but computed expected_text mapping says {expected_text!r}"
        )
    if str(actual_text) != exp:
        raise AssertionError(
            f"{qid} {case_label} after_line={after_line}: "
            f"actual={actual_text!r} != JSON correct {exp!r}"
        )

count = 0

# ============================================================================
# Q16 numpy var/std/IQR
# ============================================================================
import numpy as np
def q16():
    global count
    cases = [
        ('case_a', [10, 20, 30, 40, 50, 60, 70]),
        ('case_b', [2, 4, 6, 8, 10, 12, 14]),
        ('case_c', [5, 10, 15, 20, 25, 30, 35]),
    ]
    for label, arr in cases:
        a = np.array(arr, dtype=float)
        # step 3: mean (float compare)
        expected = substitute(correct_of('q_m8_016', 3), qmap['q_m8_016']['stem_variables'][label])
        if abs(float(expected) - float(a.mean())) > 1e-3:
            raise AssertionError(f"q_m8_016 {label} after_line=3: JSON={expected} vs mean={float(a.mean())}")
        # step 4: var
        expected = substitute(correct_of('q_m8_016', 4), qmap['q_m8_016']['stem_variables'][label])
        if abs(float(expected) - float(a.var())) > 1e-3:
            raise AssertionError(f"q_m8_016 {label} after_line=4: JSON={expected} vs var={float(a.var())}")
        # step 5: std
        expected = substitute(correct_of('q_m8_016', 5), qmap['q_m8_016']['stem_variables'][label])
        if abs(float(expected) - float(a.std())) > 1e-3:
            raise AssertionError(f"q_m8_016 {label} after_line=5: JSON={expected} vs std={float(a.std())}")
        # step 8: iqr
        q1, q3 = np.percentile(a, 25), np.percentile(a, 75)
        iqr = q3 - q1
        expected = substitute(correct_of('q_m8_016', 8), qmap['q_m8_016']['stem_variables'][label])
        if abs(float(expected) - float(iqr)) > 1e-3:
            raise AssertionError(f"q_m8_016 {label} after_line=8: JSON={expected} vs iqr={float(iqr)}")
        count += 4
q16()

# ============================================================================
# Q17 IQR outlier
# ============================================================================
def q17():
    global count
    cases = [
        ('case_a', [10, 12, 14, 15, 16, 18, 20, 50]),
        ('case_b', [5, 7, 9, 10, 11, 13, 15, 40]),
        ('case_c', [100, 102, 105, 108, 110, 112, 115, 200]),
    ]
    for label, arr in cases:
        a = np.array(arr, dtype=float)
        q1, q3 = np.percentile(a, 25), np.percentile(a, 75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        outliers = [x for x in a if x < lower or x > upper]
        check('q_m8_017', label, 5, str(float(iqr)), str(float(iqr)))
        check('q_m8_017', label, 6, str(float(lower)), str(float(lower)))
        check('q_m8_017', label, 7, str(float(upper)), str(float(upper)))
        out_str = '[' + ', '.join(str(float(x)) for x in outliers) + ']'
        check('q_m8_017', label, 8, out_str, out_str)
        count += 4
q17()

# ============================================================================
# Q18 binom pmf
# ============================================================================
def q18():
    global count
    cases = [
        ('case_a', 10, 0.5, 4),
        ('case_b', 8, 0.3, 2),
        ('case_c', 5, 0.4, 3),
    ]
    for label, n, p, k in cases:
        coef = math.comb(n, k)
        pk = p ** k
        qnk = (1 - p) ** (n - k)
        pmf = coef * pk * qnk
        # Step 6: coef int -> string
        check('q_m8_018', label, 6, str(coef), str(coef))
        # Step 7: pk
        expected = substitute(correct_of('q_m8_018', 7), qmap['q_m8_018']['stem_variables'][label])
        if abs(float(expected) - pk) > 1e-6:
            raise AssertionError(f"q_m8_018 {label} after_line=7: JSON={expected} vs pk={pk}")
        # Step 8: qnk
        expected = substitute(correct_of('q_m8_018', 8), qmap['q_m8_018']['stem_variables'][label])
        if abs(float(expected) - qnk) > 1e-4:
            raise AssertionError(f"q_m8_018 {label} after_line=8: JSON={expected} vs qnk={qnk}")
        # Step 9: pmf rounded to 4
        expected = substitute(correct_of('q_m8_018', 9), qmap['q_m8_018']['stem_variables'][label])
        if abs(float(expected) - pmf) > 1e-3:
            raise AssertionError(f"q_m8_018 {label} after_line=9: JSON={expected} vs pmf={pmf}")
        count += 4
q18()

# ============================================================================
# Q19 z-test
# ============================================================================
def q19():
    global count
    cases = [
        ('case_a', 105, 100, 15, 36),
        ('case_b', 52, 50, 8, 64),
        ('case_c', 78, 75, 12, 100),
    ]
    for label, xbar, mu0, sigma, n in cases:
        se = sigma / math.sqrt(n)
        z = (xbar - mu0) / se
        reject = abs(z) > 1.96
        # Step 6: se
        expected = substitute(correct_of('q_m8_019', 6), qmap['q_m8_019']['stem_variables'][label])
        if abs(float(expected) - se) > 1e-3:
            raise AssertionError(f"q_m8_019 {label} after_line=6: JSON={expected} vs se={se}")
        # Step 7: z
        expected = substitute(correct_of('q_m8_019', 7), qmap['q_m8_019']['stem_variables'][label])
        if abs(float(expected) - z) > 1e-3:
            raise AssertionError(f"q_m8_019 {label} after_line=7: JSON={expected} vs z={z}")
        # Step 8: reject (boolean as "True"/"False")
        expected = substitute(correct_of('q_m8_019', 8), qmap['q_m8_019']['stem_variables'][label])
        if expected != str(reject):
            raise AssertionError(f"q_m8_019 {label} after_line=8: JSON={expected} vs reject={reject}")
        count += 3
q19()

# ============================================================================
# Q20 pandas groupby fillna
# ============================================================================
import pandas as pd
def q20():
    global count
    cases_data = [
        ('case_a', ['A','A','A','B','B','B'], [10.0, np.nan, 30.0, 20.0, np.nan, 40.0]),
        ('case_b', ['X','X','X','Y','Y','Y'], [4.0, np.nan, 8.0, np.nan, 30.0, 50.0]),
        ('case_c', ['P','P','P','Q','Q','Q'], [100.0, 200.0, np.nan, np.nan, 50.0, 70.0]),
    ]
    for label, g, v in cases_data:
        df = pd.DataFrame({'g': g, 'v': v})
        nulls = int(df['v'].isnull().sum())
        g_mean = df.groupby('g')['v'].mean().to_dict()
        df['filled'] = df.groupby('g')['v'].transform(lambda s: s.fillna(s.mean()))
        filled_list = df['filled'].tolist()
        # Step 4: nulls
        check('q_m8_020', label, 4, str(nulls), str(nulls))
        # Step 5: g_mean dict — JSON format is like "{'A': 20.0, 'B': 30.0}"
        gm_str = str(g_mean)
        expected = substitute(correct_of('q_m8_020', 5), qmap['q_m8_020']['stem_variables'][label])
        if expected != gm_str:
            raise AssertionError(f"q_m8_020 {label} after_line=5: JSON={expected} vs g_mean={gm_str}")
        # Step 7: filled_list
        fl_str = str(filled_list)
        expected = substitute(correct_of('q_m8_020', 7), qmap['q_m8_020']['stem_variables'][label])
        if expected != fl_str:
            raise AssertionError(f"q_m8_020 {label} after_line=7: JSON={expected} vs filled={fl_str}")
        count += 3
q20()

# ============================================================================
# Q21 combined statistics
# ============================================================================
def q21():
    global count
    cases = [
        ('case_a', 50, 80.0, 4.0, 30, 90.0, 9.0),
        ('case_b', 100, 60.0, 16.0, 50, 75.0, 25.0),
        ('case_c', 40, 50.0, 9.0, 60, 40.0, 4.0),
    ]
    for label, n1, m1, v1, n2, m2, v2 in cases:
        n_total = n1 + n2
        mc = (n1 * m1 + n2 * m2) / n_total
        vc = (n1 * (v1 + (m1 - mc) ** 2) + n2 * (v2 + (m2 - mc) ** 2)) / n_total
        # Step 7: n_total int
        check('q_m8_021', label, 7, str(n_total), str(n_total))
        # Step 8: mc
        expected = substitute(correct_of('q_m8_021', 8), qmap['q_m8_021']['stem_variables'][label])
        if abs(float(expected) - mc) > 1e-3:
            raise AssertionError(f"q_m8_021 {label} after_line=8: JSON={expected} vs mc={mc}")
        # Step 9: vc
        expected = substitute(correct_of('q_m8_021', 9), qmap['q_m8_021']['stem_variables'][label])
        if abs(float(expected) - vc) > 1e-3:
            raise AssertionError(f"q_m8_021 {label} after_line=9: JSON={expected} vs vc={vc}")
        count += 3
q21()

# ============================================================================
# Q22 Apriori
# ============================================================================
def q22():
    global count
    cases = [
        ('case_a', [{'A','B','C'}, {'A','B'}, {'A','C'}, {'A','B','D'}, {'B','C'}], 'A', 'B'),
        ('case_b', [{'X','Y'}, {'X','Y'}, {'X','Z'}, {'X','Z'}, {'X','W'}], 'X', 'Y'),
        ('case_c', [{'M','N','P'}, {'M','N'}, {'M','N'}, {'M','N','Q'}, {'P','Q'}], 'M', 'N'),
    ]
    for label, txns, A, B in cases:
        total = len(txns)
        count_A = sum(1 for t in txns if A in t)
        count_AB = sum(1 for t in txns if A in t and B in t)
        sup = count_AB / total
        conf = count_AB / count_A
        check('q_m8_022', label, 5, str(count_A), str(count_A))
        check('q_m8_022', label, 6, str(count_AB), str(count_AB))
        expected = substitute(correct_of('q_m8_022', 7), qmap['q_m8_022']['stem_variables'][label])
        if abs(float(expected) - sup) > 1e-3:
            raise AssertionError(f"q_m8_022 {label} after_line=7: JSON={expected} vs sup={sup}")
        expected = substitute(correct_of('q_m8_022', 8), qmap['q_m8_022']['stem_variables'][label])
        if abs(float(expected) - conf) > 1e-3:
            raise AssertionError(f"q_m8_022 {label} after_line=8: JSON={expected} vs conf={conf}")
        count += 4
q22()

# ============================================================================
# Q23 Markov
# ============================================================================
def q23():
    global count
    cases = [
        ('case_a', [[0.8, 0.2], [0.3, 0.7]], [0.5, 0.5]),
        ('case_b', [[0.6, 0.4], [0.1, 0.9]], [0.2, 0.8]),
        ('case_c', [[0.5, 0.5], [0.2, 0.8]], [0.3, 0.7]),
    ]
    for label, P, pi_t in cases:
        Pm = np.array(P)
        pi = np.array(pi_t)
        row_sums = Pm.sum(axis=1)
        pi_next = pi @ Pm
        # Step 4: row_sums "[1.0, 1.0]"
        rs_str = '[' + ', '.join(str(float(x)) for x in row_sums) + ']'
        expected = substitute(correct_of('q_m8_023', 4), qmap['q_m8_023']['stem_variables'][label])
        if expected != rs_str:
            raise AssertionError(f"q_m8_023 {label} after_line=4: JSON={expected} vs rs={rs_str}")
        # Step 6: next_state0
        expected = substitute(correct_of('q_m8_023', 6), qmap['q_m8_023']['stem_variables'][label])
        if abs(float(expected) - float(pi_next[0])) > 1e-3:
            raise AssertionError(f"q_m8_023 {label} after_line=6: JSON={expected} vs ns0={pi_next[0]}")
        # Step 7: next_state1
        expected = substitute(correct_of('q_m8_023', 7), qmap['q_m8_023']['stem_variables'][label])
        if abs(float(expected) - float(pi_next[1])) > 1e-3:
            raise AssertionError(f"q_m8_023 {label} after_line=7: JSON={expected} vs ns1={pi_next[1]}")
        count += 3
q23()

# ============================================================================
# Q24 time series
# ============================================================================
def q24():
    global count
    cases = [
        ('case_a', [10, 12, 14, 16, 18, 20, 30]),
        ('case_b', [5, 8, 11, 14, 17, 20, 25]),
        ('case_c', [100, 102, 104, 106, 108, 110, 120]),
    ]
    for label, series in cases:
        s = pd.Series(series, dtype=float)
        trend = s.rolling(window=3).mean()
        detrended = s - trend
        last_trend = round(float(trend.iloc[6]), 3)
        last_detrended = round(float(detrended.iloc[6]), 3)
        first_valid = trend.first_valid_index()
        # Step 5: last_trend
        expected = substitute(correct_of('q_m8_024', 5), qmap['q_m8_024']['stem_variables'][label])
        if abs(float(expected) - last_trend) > 1e-2:
            raise AssertionError(f"q_m8_024 {label} after_line=5: JSON={expected} vs last_trend={last_trend}")
        # Step 6: last_detrended
        expected = substitute(correct_of('q_m8_024', 6), qmap['q_m8_024']['stem_variables'][label])
        if abs(float(expected) - last_detrended) > 1e-2:
            raise AssertionError(f"q_m8_024 {label} after_line=6: JSON={expected} vs last_detrended={last_detrended}")
        # Step 7: first_valid_index
        expected = substitute(correct_of('q_m8_024', 7), qmap['q_m8_024']['stem_variables'][label])
        if int(expected) != int(first_valid):
            raise AssertionError(f"q_m8_024 {label} after_line=7: JSON={expected} vs first_valid={first_valid}")
        count += 3
q24()

# ============================================================================
# Q25 SMOTE
# ============================================================================
from collections import Counter
def q25():
    global count
    cases = [('case_a', 90, 10), ('case_b', 80, 20), ('case_c', 60, 15)]
    for label, n_maj, n_min in cases:
        labels = [0] * n_maj + [1] * n_min
        cnt_before = Counter(labels)
        maj_count = max(cnt_before.values())
        min_count = min(cnt_before.values())
        n_synthetic = maj_count - min_count
        cnt_after = dict(cnt_before)
        cnt_after[1] = maj_count
        # Step 3
        check('q_m8_025', label, 3, str(cnt_before), str(cnt_before))
        # Step 6
        check('q_m8_025', label, 6, str(n_synthetic), str(n_synthetic))
        # Step 8
        check('q_m8_025', label, 8, str(cnt_after), str(cnt_after))
        count += 3
q25()

# ============================================================================
# Q26 tokenize
# ============================================================================
def q26():
    global count
    cases = [
        ('case_a', 'the cat sat on the mat the cat ran'),
        ('case_b', 'data science is fun data is everywhere'),
        ('case_c', 'ai is the future ai is here ai works'),
    ]
    for label, text in cases:
        tokens = text.split()
        n_tokens = len(tokens)
        vocab = set(tokens)
        vocab_size = len(vocab)
        ratio = round(vocab_size / n_tokens, 4)
        # Step 3
        check('q_m8_026', label, 3, str(n_tokens), str(n_tokens))
        # Step 5
        check('q_m8_026', label, 5, str(vocab_size), str(vocab_size))
        # Step 6: ratio
        expected = substitute(correct_of('q_m8_026', 6), qmap['q_m8_026']['stem_variables'][label])
        if abs(float(expected) - ratio) > 1e-3:
            raise AssertionError(f"q_m8_026 {label} after_line=6: JSON={expected} vs ratio={ratio}")
        count += 3
q26()

# ============================================================================
# Q27 DP Laplace
# ============================================================================
def q27():
    global count
    cases = [
        ('case_a', 100, 2.3, 1.0, 1.0),
        ('case_b', 500, -3.7, 0.5, 1.0),
        ('case_c', 250, 1.8, 2.0, 1.0),
    ]
    for label, true_count, noise, eps, sens in cases:
        noisy = true_count + noise
        scale = sens / eps
        within = abs(noise) <= 3 * scale
        # Step 5: noisy
        expected = substitute(correct_of('q_m8_027', 5), qmap['q_m8_027']['stem_variables'][label])
        if abs(float(expected) - noisy) > 1e-3:
            raise AssertionError(f"q_m8_027 {label} after_line=5: JSON={expected} vs noisy={noisy}")
        # Step 6: scale
        expected = substitute(correct_of('q_m8_027', 6), qmap['q_m8_027']['stem_variables'][label])
        if abs(float(expected) - scale) > 1e-3:
            raise AssertionError(f"q_m8_027 {label} after_line=6: JSON={expected} vs scale={scale}")
        # Step 7: within
        expected = substitute(correct_of('q_m8_027', 7), qmap['q_m8_027']['stem_variables'][label])
        if expected != str(within):
            raise AssertionError(f"q_m8_027 {label} after_line=7: JSON={expected} vs within={within}")
        count += 3
q27()

print(f"mock-mode8-l22.py: PASS = {count} assertions across 12 questions × 3 cases")
sys.exit(0)
