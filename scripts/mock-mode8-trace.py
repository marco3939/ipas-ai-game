"""
mock-mode8-trace.py — 對 src/questions-mode8-trace.json 內每題的每個 case:
  1. 用 case 值替換 code_block 內 placeholder
  2. 用 case 值替換每個 trace_step.options[*].text 內 placeholder
  3. 用 Python 實際執行替換後的 code_block 至每個 trace_step.after_line
  4. 比對 trace_step.options 中 is_correct=true 的選項文字(已替換)是否與 Python 實際執行後的可能變數狀態相符

R4B retrofit:本 mock 由 R3 的「固定值對照」擴展為「逐 case 替換 + 對照」。
若題目沒有 stem_variables.case_*(舊版題或未 retrofit),回退到 R3 行為,直接執行 raw code_block。

注意:本腳本不能機械比對「正解 == 變數值字面化」,因為:
  - 不同題的 trace_step 問的 變數名 / 屬性 / 值 都不同(shape / dtype / 內容 / 計數)
  - Python 變數值字面化不一定等於選項文字(例如 ndarray repr 含換行)

採用 hand-coded verifier 策略:每題 id 對應一個 verifier function,
verifier 讀 step after_line 取得實際執行的環境快照,以邏輯比對(不是字面比對)
trace_step.options[is_correct].text 是否合理。

使用:
  python scripts/mock-mode8-trace.py
exit 0 = 全 PASS;exit 1 = 任一 FAIL。
"""
import json
import re
import sys
import io
from pathlib import Path

ROOT = Path(__file__).parent.parent
QFILE = ROOT / 'src' / 'questions-mode8-trace.json'

# ============================================================================
# Substitution helpers — 模擬 src/index.html renderQuestion 內 subAll(string)
# ============================================================================

def substitute(text, case):
    """對字串 text 套用 case dict 內所有 {key} → value 替換。"""
    if not isinstance(text, str):
        return text
    out = text
    for k, v in case.items():
        out = out.replace('{' + k + '}', str(v))
    return out

def find_residual_placeholders(text):
    """回傳 text 內所有未被替換的 {xxx} placeholder list。"""
    if not isinstance(text, str):
        return []
    return re.findall(r'\{[a-zA-Z_][a-zA-Z0-9_]*\}', text)

# ============================================================================
# Python 執行(隔離 namespace,沉默 stdout)
# ============================================================================

def execute_to_line(code_block, after_line):
    """執行 code_block 至 after_line(含)後,回傳 locals 字典快照。"""
    lines = code_block.split('\n')
    if after_line < 1 or after_line > len(lines):
        raise ValueError(f"after_line {after_line} out of range 1..{len(lines)}")
    partial = '\n'.join(lines[:after_line])
    env = {}
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(partial, env)
    finally:
        sys.stdout = old_stdout
    return env

def expected_text_of(step, case):
    """取出 trace_step 內 is_correct=true 的選項 text(經 case 替換後)。"""
    correct = [o for o in step['options'] if o.get('is_correct')]
    if len(correct) != 1:
        raise ValueError(f"step has {len(correct)} correct options (expected 1)")
    return substitute(correct[0]['text'], case) if case else correct[0]['text']

# ============================================================================
# 各題的邏輯 verifier(以實際執行後 env 中的變數比對 trace_step 期望)
# 每個 verifier 簽名:verify(env_after, step_idx, expected_text)
#   env_after  : 執行 code_block 至 after_line 後的 locals dict
#   step_idx   : after_line(int,1-based)
#   expected_text : trace_step.options[is_correct].text 經 case 替換後的字面字串
# 回傳:bool — True 為 PASS
# ============================================================================

def verify_q_m8_001(env_after, step_idx, expected):
    """L2 norm:
       after_line=2 → v.shape
       after_line=3 → sq 內容
       after_line=4 → s 值
       after_line=5 → result 值
    """
    if step_idx == 2:
        return str(tuple(env_after['v'].shape)) == expected  # 期望 "(2,)"
    if step_idx == 3:
        # expected 例:"[9.0, 16.0]" / "[25.0, 144.0]" / "[64.0, 36.0]"
        actual = '[' + ', '.join(str(float(x)) for x in env_after['sq']) + ']'
        return actual == expected
    if step_idx == 4:
        # expected 例:"25.0" / "169.0" / "100.0"
        return str(float(env_after['s'])) == expected
    if step_idx == 5:
        return str(float(env_after['result'])) == expected
    return False

def verify_q_m8_002(env_after, step_idx, expected):
    """逆序對:
       after_line=1 → len(arr)
       after_line=2 → count 初始值
       after_line=7 → 迴圈結束後 count
    """
    if step_idx == 1:
        return str(len(env_after['arr'])) == expected
    if step_idx == 2:
        return str(env_after['count']) == expected  # "0"
    if step_idx == 7:
        return str(env_after['count']) == expected
    return False

def verify_q_m8_003(env_after, step_idx, expected):
    """ReLU:
       after_line=2 → x.dtype
       after_line=3 → out 內容
       after_line=4 → total 值
    """
    if step_idx == 2:
        return str(env_after['x'].dtype) == expected  # "float64"
    if step_idx == 3:
        actual = '[' + ', '.join(str(float(v)) for v in env_after['out']) + ']'
        return actual == expected
    if step_idx == 4:
        return str(float(env_after['total'])) == expected
    return False

def verify_q_m8_004(env_after, step_idx, expected):
    """Logistic:
       after_line=5 → z
       after_line=6 → p 四捨五入到三位小數
       after_line=7 → y_pred
    """
    if step_idx == 5:
        return str(float(env_after['z'])) == expected
    if step_idx == 6:
        actual_p = round(float(env_after['p']), 3)
        # 試圖將 expected 解析為浮點(可能是 "0.731" / "0.881" 等)
        try:
            exp_p = float(expected)
        except ValueError:
            return False
        return abs(actual_p - exp_p) < 1e-3
    if step_idx == 7:
        return str(env_after['y_pred']) == expected
    return False

def verify_q_m8_005(env_after, step_idx, expected):
    """DBSCAN:
       after_line=2 → points.shape
       after_line=9 → counts(for-loop 結束後)
       after_line=15 → labels
    """
    if step_idx == 2:
        return str(tuple(env_after['points'].shape)) == expected
    if step_idx == 9:
        return str(env_after['counts']) == expected
    if step_idx == 15:
        return str(env_after['labels']) == expected
    return False

# === q_m8_006..q_m8_015(R5 expansion):每題 4 trace_steps ===

def verify_q_m8_006(env_after, step_idx, expected):
    """reshape + transpose:
       after_line=2 → a.shape (e.g. "(3, 4)")
       after_line=3 → t.shape (e.g. "(4, 3)")
       after_line=4 → b.shape
       after_line=5 → total (int)
    """
    if step_idx == 2:
        return str(tuple(env_after['a'].shape)) == expected
    if step_idx == 3:
        return str(tuple(env_after['t'].shape)) == expected
    if step_idx == 4:
        return str(tuple(env_after['b'].shape)) == expected
    if step_idx == 5:
        return str(int(env_after['total'])) == expected
    return False

def verify_q_m8_007(env_after, step_idx, expected):
    """matmul + broadcasting:
       after_line=2 → A.shape "(2, 2)"
       after_line=4 → C[0][0] (float)
       after_line=6 (step3) → D.shape
       after_line=6 (step4) → D[0][0]
    """
    if step_idx == 2:
        return str(tuple(env_after['A'].shape)) == expected
    if step_idx == 4:
        return str(float(env_after['C'][0][0])) == expected
    if step_idx == 6:
        # 兩步都在 after_line=6,試 D.shape 與 D[0][0] 兩種比對
        shape_str = str(tuple(env_after['D'].shape))
        d00_str = str(float(env_after['D'][0][0]))
        return expected == shape_str or expected == d00_str
    return False

def verify_q_m8_008(env_after, step_idx, expected):
    """Fibonacci iterative:
       after_line=2 → a 初始值 (0)
       after_line=3 → b 初始值 (1)
       after_line=5 → 第 1 次迴圈後 a — 此步需執行至迴圈第一輪
                       但 exec 整段(after_line=5 = for 迴圈頭那行)是空迴圈未進入
                       因此改採:after_line=6 後 a 為 result(整迴圈走完)
                       但 ask 是「第 1 次迴圈執行後 a」→ 我們手動跑一次
       after_line=6 → result(最終答案)
    """
    if step_idx == 2:
        return str(env_after['a']) == expected
    if step_idx == 3:
        return str(env_after['b']) == expected
    if step_idx == 5:
        # after_line=5 是 for 迴圈標頭那行(含縮排內 body)— exec 已執行整個 for 迴圈
        # 「第 1 次迴圈後 a」必須手動重算
        n_val = env_after['n']
        a, b = 0, 1
        if n_val >= 1:
            a, b = b, a + b  # 第 1 次迴圈
        return str(a) == expected
    if step_idx == 6:
        return str(env_after['a']) == expected  # result = a 在第 6 行才設,我們驗 a
    return False

def verify_q_m8_009(env_after, step_idx, expected):
    """Binary search(改寫為 function + helper 變數,避免 exec 截斷 while-loop 造成無限迴圈):
       after_line=16 → hi_init(len(arr)-1)
       after_line=17 → first_mid((0+hi_init)//2)
       after_line=18 → first_val(arr[first_mid])
       after_line=19 → result(binary_search 結果)
    """
    if step_idx == 16:
        return str(env_after['hi_init']) == expected
    if step_idx == 17:
        return str(env_after['first_mid']) == expected
    if step_idx == 18:
        return str(env_after['first_val']) == expected
    if step_idx == 19:
        return str(env_after['result']) == expected
    return False

def verify_q_m8_010(env_after, step_idx, expected):
    """Softmax stable:
       after_line=3 → z_max (float)
       after_line=4 → z_shift (list)
       after_line=5 → e.sum() rounded to 4 decimal
       after_line=7 → argmax (int)
    """
    if step_idx == 3:
        return str(float(env_after['z_max'])) == expected
    if step_idx == 4:
        actual = '[' + ', '.join(str(float(x)) for x in env_after['z_shift']) + ']'
        return actual == expected
    if step_idx == 5:
        actual = round(float(env_after['e'].sum()), 4)
        try:
            exp = float(expected)
        except ValueError:
            return False
        return abs(actual - exp) < 1e-3
    if step_idx == 7:
        return str(int(env_after['argmax'])) == expected
    return False

def verify_q_m8_011(env_after, step_idx, expected):
    """K-means vectorized distance (PR #4 后實際 trace_steps 是 after_line 4-7):
       after_line=4 → diffs.shape (tuple)
       after_line=5 → sq_dists 2D as "[[r1c1, r1c2], [r2c1, r2c2], ...]"
       after_line=6 → labels list
       after_line=7 → c0_count int
    2026-05-16 修補:原 verifier 寫舊版 KNN-vote 的 step_idx 5/6/9/12,跟現行 trace_steps 不符。
    """
    if step_idx == 4:
        return str(tuple(env_after['diffs'].shape)) == expected
    if step_idx == 5:
        arr = env_after['sq_dists']
        rows = ['[' + ', '.join(str(float(x)) for x in row) + ']' for row in arr]
        actual = '[' + ', '.join(rows) + ']'
        return actual == expected
    if step_idx == 6:
        return str(env_after['labels'].tolist()) == expected
    if step_idx == 7:
        return str(env_after['c0_count']) == expected
    return False

def verify_q_m8_012(env_after, step_idx, expected):
    """k-means centroid:
       after_line=4 → c0_pts.shape[0] (number of c0 points)
       after_line=5 → c1_pts.shape[0]
       after_line=6 → new_c0 rounded to 3 decimal as list-like "[x.xxx, y.yyy]"
       after_line=7 → new_c1 rounded to 3 decimal
    """
    if step_idx == 4:
        return str(env_after['c0_pts'].shape[0]) == expected
    if step_idx == 5:
        return str(env_after['c1_pts'].shape[0]) == expected
    if step_idx == 6:
        v = env_after['new_c0']
        actual = '[' + ', '.join(str(round(float(x), 3)) for x in v) + ']'
        return actual == expected
    if step_idx == 7:
        v = env_after['new_c1']
        actual = '[' + ', '.join(str(round(float(x), 3)) for x in v) + ']'
        return actual == expected
    return False

def verify_q_m8_013(env_after, step_idx, expected):
    """pandas groupby:
       after_line=3 → df.shape
       after_line=4 → g_sum.to_dict()
       after_line=5 → g_count.to_dict()
       after_line=6 → sum_g0 (int)
    """
    if step_idx == 3:
        return str(tuple(env_after['shape'])) == expected
    if step_idx == 4:
        actual = str(env_after['g_sum'].to_dict())
        return actual == expected
    if step_idx == 5:
        actual = str(env_after['g_count'].to_dict())
        return actual == expected
    if step_idx == 6:
        return str(int(env_after['sum_g0'])) == expected
    return False

def verify_q_m8_014(env_after, step_idx, expected):
    """fillna mean:
       after_line=4 → nulls_before (int)
       after_line=5 → mean (float)
       after_line=6 → filled (list of floats)
       after_line=7 → total (float)
    """
    if step_idx == 4:
        return str(int(env_after['nulls_before'])) == expected
    if step_idx == 5:
        return str(float(env_after['mean'])) == expected
    if step_idx == 6:
        actual = '[' + ', '.join(str(float(x)) for x in env_after['filled']) + ']'
        return actual == expected
    if step_idx == 7:
        return str(float(env_after['total'])) == expected
    return False

def verify_q_m8_015(env_after, step_idx, expected):
    """merge inner/left:
       after_line=4(step1)→ inner.shape
       after_line=4(step2)→ inner['id'] as list
       after_line=5 → left_join.shape
       after_line=6 → inner_rows (int)
    """
    if step_idx == 4:
        # 兩步都在 after_line=4 — 試兩種比對
        shape_str = str(tuple(env_after['inner'].shape))
        id_list_str = str(env_after['inner']['id'].tolist())
        return expected == shape_str or expected == id_list_str
    if step_idx == 5:
        return str(tuple(env_after['left_join'].shape)) == expected
    if step_idx == 6:
        return str(int(env_after['inner_rows'])) == expected
    return False

# === q_m8_016..q_m8_027(R5 L22 大數據擴充):每題 3-4 trace_steps ===

def _floats_eq(a_str, b_str, tol=1e-3):
    """Compare two strings as floats with tolerance; fall back to string equality."""
    try:
        return abs(float(a_str) - float(b_str)) <= tol
    except (ValueError, TypeError):
        return a_str == b_str

def verify_q_m8_016(env_after, step_idx, expected):
    """numpy var/std/IQR:
       after_line=3 → mean
       after_line=4 → var (ddof=0)
       after_line=5 → std
       after_line=8 → iqr
    """
    import numpy as np
    if step_idx == 3:
        return _floats_eq(str(float(env_after['mean'])), expected)
    if step_idx == 4:
        return _floats_eq(str(float(env_after['var'])), expected)
    if step_idx == 5:
        return _floats_eq(str(float(env_after['std'])), expected)
    if step_idx == 8:
        return _floats_eq(str(float(env_after['iqr'])), expected)
    return False

def verify_q_m8_017(env_after, step_idx, expected):
    """IQR outlier:
       after_line=5 → iqr
       after_line=6 → lower
       after_line=7 → upper
       after_line=8 → outliers list
    """
    if step_idx == 5:
        return _floats_eq(str(float(env_after['iqr'])), expected)
    if step_idx == 6:
        return _floats_eq(str(float(env_after['lower'])), expected)
    if step_idx == 7:
        return _floats_eq(str(float(env_after['upper'])), expected)
    if step_idx == 8:
        actual = '[' + ', '.join(str(float(x)) for x in env_after['outliers']) + ']'
        return actual == expected
    return False

def verify_q_m8_018(env_after, step_idx, expected):
    """binom pmf:
       after_line=6 → coef (int)
       after_line=7 → pk
       after_line=8 → qnk
       after_line=9 → pmf
    """
    if step_idx == 6:
        return str(env_after['coef']) == expected
    if step_idx == 7:
        return _floats_eq(str(env_after['pk']), expected, tol=1e-4)
    if step_idx == 8:
        return _floats_eq(str(env_after['qnk']), expected, tol=1e-3)
    if step_idx == 9:
        return _floats_eq(str(env_after['pmf']), expected, tol=1e-3)
    return False

def verify_q_m8_019(env_after, step_idx, expected):
    """z-test:
       after_line=6 → se
       after_line=7 → z
       after_line=8 → reject (True/False)
    """
    if step_idx == 6:
        return _floats_eq(str(env_after['se']), expected)
    if step_idx == 7:
        return _floats_eq(str(env_after['z']), expected)
    if step_idx == 8:
        return str(env_after['reject']) == expected
    return False

def verify_q_m8_020(env_after, step_idx, expected):
    """pandas groupby fillna:
       after_line=4 → nulls
       after_line=5 → g_mean dict
       after_line=7 → filled_list
    """
    if step_idx == 4:
        return str(int(env_after['nulls'])) == expected
    if step_idx == 5:
        return str(env_after['g_mean'].to_dict()) == expected
    if step_idx == 7:
        return str(env_after['filled_list']) == expected
    return False

def verify_q_m8_021(env_after, step_idx, expected):
    """combined statistics:
       after_line=7 → n_total (int)
       after_line=8 → mc
       after_line=9 → vc
    """
    if step_idx == 7:
        return str(int(env_after['n_total'])) == expected
    if step_idx == 8:
        return _floats_eq(str(env_after['mc']), expected)
    if step_idx == 9:
        return _floats_eq(str(env_after['vc']), expected)
    return False

def verify_q_m8_022(env_after, step_idx, expected):
    """Apriori:
       after_line=5 → count_A (int)
       after_line=6 → count_AB (int)
       after_line=7 → support_AB
       after_line=8 → confidence_AtoB
    """
    if step_idx == 5:
        return str(env_after['count_A']) == expected
    if step_idx == 6:
        return str(env_after['count_AB']) == expected
    if step_idx == 7:
        return _floats_eq(str(env_after['support_AB']), expected)
    if step_idx == 8:
        return _floats_eq(str(env_after['confidence_AtoB']), expected)
    return False

def verify_q_m8_023(env_after, step_idx, expected):
    """Markov:
       after_line=4 → row_sums "[1.0, 1.0]"
       after_line=6 → next_state0
       after_line=7 → next_state1
    """
    if step_idx == 4:
        actual = '[' + ', '.join(str(float(x)) for x in env_after['row_sums']) + ']'
        return actual == expected
    if step_idx == 6:
        return _floats_eq(str(float(env_after['next_state0'])), expected)
    if step_idx == 7:
        return _floats_eq(str(float(env_after['next_state1'])), expected)
    return False

def verify_q_m8_024(env_after, step_idx, expected):
    """time series additive:
       after_line=5 → last_trend (rounded 3)
       after_line=6 → last_detrended (rounded 3)
       after_line=7 → first_valid_index (int)
    """
    if step_idx == 5:
        actual = round(float(env_after['last_trend']), 3)
        try:
            return abs(actual - float(expected)) <= 1e-2
        except ValueError:
            return False
    if step_idx == 6:
        actual = round(float(env_after['last_detrended']), 3)
        try:
            return abs(actual - float(expected)) <= 1e-2
        except ValueError:
            return False
    if step_idx == 7:
        return str(env_after['first_valid_index']) == expected
    return False

def verify_q_m8_025(env_after, step_idx, expected):
    """SMOTE:
       after_line=3 → cnt_before (Counter repr)
       after_line=6 → n_synthetic (int)
       after_line=8 → cnt_after (dict)
    """
    if step_idx == 3:
        return str(env_after['cnt_before']) == expected
    if step_idx == 6:
        return str(env_after['n_synthetic']) == expected
    if step_idx == 8:
        return str(env_after['cnt_after']) == expected
    return False

def verify_q_m8_026(env_after, step_idx, expected):
    """tokenize:
       after_line=3 → n_tokens (int)
       after_line=5 → vocab_size (int)
       after_line=6 → ratio (4 decimal)
    """
    if step_idx == 3:
        return str(env_after['n_tokens']) == expected
    if step_idx == 5:
        return str(env_after['vocab_size']) == expected
    if step_idx == 6:
        try:
            return abs(round(float(env_after['ratio']), 4) - float(expected)) <= 1e-3
        except ValueError:
            return False
    return False

def verify_q_m8_027(env_after, step_idx, expected):
    """DP Laplace:
       after_line=5 → noisy_answer
       after_line=6 → scale
       after_line=7 → within_3scale (bool)
    """
    if step_idx == 5:
        return _floats_eq(str(env_after['noisy_answer']), expected)
    if step_idx == 6:
        return _floats_eq(str(env_after['scale']), expected)
    if step_idx == 7:
        return str(env_after['within_3scale']) == expected
    return False

VERIFIERS = {
    'q_m8_001': verify_q_m8_001,
    'q_m8_002': verify_q_m8_002,
    'q_m8_003': verify_q_m8_003,
    'q_m8_004': verify_q_m8_004,
    'q_m8_005': verify_q_m8_005,
    'q_m8_006': verify_q_m8_006,
    'q_m8_007': verify_q_m8_007,
    'q_m8_008': verify_q_m8_008,
    'q_m8_009': verify_q_m8_009,
    'q_m8_010': verify_q_m8_010,
    'q_m8_011': verify_q_m8_011,
    'q_m8_012': verify_q_m8_012,
    'q_m8_013': verify_q_m8_013,
    'q_m8_014': verify_q_m8_014,
    'q_m8_015': verify_q_m8_015,
    'q_m8_016': verify_q_m8_016,
    'q_m8_017': verify_q_m8_017,
    'q_m8_018': verify_q_m8_018,
    'q_m8_019': verify_q_m8_019,
    'q_m8_020': verify_q_m8_020,
    'q_m8_021': verify_q_m8_021,
    'q_m8_022': verify_q_m8_022,
    'q_m8_023': verify_q_m8_023,
    'q_m8_024': verify_q_m8_024,
    'q_m8_025': verify_q_m8_025,
    'q_m8_026': verify_q_m8_026,
    'q_m8_027': verify_q_m8_027,
}

# ============================================================================
# 主流程
# ============================================================================

def iter_cases(q):
    """產生 (case_label, case_dict) tuple 序列。
    若題目沒 stem_variables.case_*,回傳一個 (None, None) 代表「跑 raw code_block」。
    """
    sv = q.get('stem_variables') or {}
    case_keys = [k for k in sv.keys() if k.startswith('case_')]
    if not case_keys:
        yield (None, None)
        return
    for k in case_keys:
        yield (k, sv[k])

def main():
    data = json.loads(QFILE.read_text(encoding='utf-8'))
    questions = data['questions']
    total = 0
    passed = 0
    errors = []
    cases_seen = {}

    for q in questions:
        qid = q['id']
        verifier = VERIFIERS.get(qid)
        if verifier is None:
            errors.append(f"{qid}: no verifier registered (add to VERIFIERS dict)")
            continue

        # 跨檔契約稽核:每 case 必有相同 key set
        sv = q.get('stem_variables') or {}
        case_keys = sorted([k for k in sv.keys() if k.startswith('case_')])
        if case_keys:
            key_sets = {ck: tuple(sorted(sv[ck].keys())) for ck in case_keys}
            distinct_sets = set(key_sets.values())
            if len(distinct_sets) > 1:
                errors.append(f"{qid}: case_* key sets are not identical across cases: {key_sets}")

        cases_seen[qid] = len(case_keys) if case_keys else 0

        for case_label, case in iter_cases(q):
            # 替換 code_block(若有 case;否則保留 raw)
            code_block = substitute(q['code_block'], case) if case else q['code_block']

            # 殘留 placeholder 檢查(替換後不該再有 {xxx})
            residuals = find_residual_placeholders(code_block)
            if residuals:
                errors.append(f"{qid} [{case_label}]: code_block residual placeholders: {residuals}")

            for step in q['trace_steps']:
                total += 1
                after_line = step['after_line']

                # 取「正確選項」文字,經 case 替換
                try:
                    expected = expected_text_of(step, case)
                except ValueError as e:
                    errors.append(f"{qid} [{case_label}] step after_line={after_line}: {e}")
                    continue

                # 殘留 placeholder 檢查
                exp_residuals = find_residual_placeholders(expected)
                if exp_residuals:
                    errors.append(
                        f"{qid} [{case_label}] step after_line={after_line}: "
                        f"expected text has residual placeholders: {exp_residuals}"
                    )

                # 對每個選項都檢查殘留(任一錯誤選項殘留也算違規)
                for oi, opt in enumerate(step['options']):
                    opt_text_sub = substitute(opt.get('text', ''), case)
                    opt_resid = find_residual_placeholders(opt_text_sub)
                    if opt_resid:
                        errors.append(
                            f"{qid} [{case_label}] step after_line={after_line} option[{oi}]: "
                            f"residual placeholders: {opt_resid}"
                        )
                    # trap_type 也檢查
                    trap_sub = substitute(opt.get('trap_type', ''), case)
                    trap_resid = find_residual_placeholders(trap_sub)
                    if trap_resid:
                        errors.append(
                            f"{qid} [{case_label}] step after_line={after_line} option[{oi}].trap_type: "
                            f"residual placeholders: {trap_resid}"
                        )

                # 執行 Python
                try:
                    env_after = execute_to_line(code_block, after_line)
                except Exception as e:
                    errors.append(
                        f"{qid} [{case_label}] step after_line={after_line}: "
                        f"exec failed — {e!r}"
                    )
                    continue

                # 用 verifier 判 PASS/FAIL
                try:
                    ok = verifier(env_after, after_line, expected)
                except Exception as e:
                    errors.append(
                        f"{qid} [{case_label}] step after_line={after_line}: "
                        f"verifier raised — {e!r}"
                    )
                    continue

                if ok:
                    passed += 1
                else:
                    errors.append(
                        f"{qid} [{case_label}] step after_line={after_line}: "
                        f"expected={expected!r} did not match Python execution"
                    )

    # 顯示 case 覆蓋摘要
    print(f"mock-mode8-trace.py: PASS={passed}/{total}")
    print("--- case coverage ---")
    for qid in sorted(cases_seen.keys()):
        n = cases_seen[qid]
        if n == 0:
            print(f"  {qid}: NO STEM_VARIABLES (raw code_block only)")
        else:
            print(f"  {qid}: {n} cases")

    if errors:
        print("--- errors ---")
        for e in errors:
            print(f"  {e}")
        return 1
    print("all trace_step is_correct answers verified across all cases against actual Python execution")
    return 0

if __name__ == '__main__':
    sys.exit(main())
