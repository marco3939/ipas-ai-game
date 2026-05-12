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

VERIFIERS = {
    'q_m8_001': verify_q_m8_001,
    'q_m8_002': verify_q_m8_002,
    'q_m8_003': verify_q_m8_003,
    'q_m8_004': verify_q_m8_004,
    'q_m8_005': verify_q_m8_005,
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
