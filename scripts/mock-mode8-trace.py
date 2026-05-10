"""
mock-mode8-trace.py — 對 src/questions-mode8-trace.json 內每題:
  1. 用 Python 實際執行 code_block 至每個 trace_step.after_line
  2. 比對 trace_step.options 中標記 is_correct=true 的選項文字,
     是否與 Python 實際執行後的可能變數狀態相符

注意:本腳本不能機械比對「正解 == 變數值」,因為:
  - 不同題的 trace_step 問的 變數名 / 屬性 / 值 都不同(shape / dtype / 內容 / 計數)
  - Python 變數值字面化不一定等於選項文字(例如 ndarray repr 含換行)

採用 hand-coded verifier 策略:每題 id 對應一個 verifier function,
verifier 讀 step idx 取得實際執行的環境快照,以邏輯比對(不是字面比對)
trace_step.options[is_correct].text 是否合理。

使用:
  python scripts/mock-mode8-trace.py
exit 0 = 全 PASS;exit 1 = 任一 FAIL。
"""
import json
import sys
import io
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
QFILE = ROOT / 'src' / 'questions-mode8-trace.json'

def execute_to_line(code_block, after_line):
    """執行 code_block 至 after_line(含)後,回傳 locals 字典快照。"""
    lines = code_block.split('\n')
    if after_line < 1 or after_line > len(lines):
        raise ValueError(f"after_line {after_line} out of range 1..{len(lines)}")
    partial = '\n'.join(lines[:after_line])
    env = {}
    # 隔離 stdout 避免題目 print 干擾
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(partial, env)
    finally:
        sys.stdout = old_stdout
    return env

def expected_text_of(step):
    """取出 trace_step 內 is_correct=true 的選項 text(必為一個)。"""
    correct = [o for o in step['options'] if o.get('is_correct')]
    if len(correct) != 1:
        raise ValueError(f"step has {len(correct)} correct options (expected 1)")
    return correct[0]['text']

# ============================================================================
# 各題的邏輯 verifier(以實際執行後 env 中的變數比對 trace_step 期望)
# ============================================================================

def verify_q_m8_001(env, step_idx, expected, env_after):
    """L2 norm:after_line=2 → v.shape;3 → sq;4 → s;5 → result"""
    step_map = {
        2: lambda: str(tuple(env_after['v'].shape)) == expected,
        3: lambda: list(env_after['sq']) == [9.0, 16.0] and expected == '[9.0, 16.0]',
        4: lambda: float(env_after['s']) == 25.0 and expected == '25.0',
        5: lambda: float(env_after['result']) == 5.0 and expected == '5.0',
    }
    return step_map.get(step_idx, lambda: False)()

def verify_q_m8_002(env, step_idx, expected, env_after):
    """逆序對:1 → len(arr);2 → count;7 → final count"""
    step_map = {
        1: lambda: len(env_after['arr']) == 5 and expected == '5',
        2: lambda: env_after['count'] == 0 and expected == '0',
        7: lambda: env_after['count'] == 3 and expected == '3',
    }
    return step_map.get(step_idx, lambda: False)()

def verify_q_m8_003(env, step_idx, expected, env_after):
    """ReLU:2 → x.dtype;3 → out;4 → total"""
    step_map = {
        2: lambda: str(env_after['x'].dtype) == 'float64' and expected == 'float64',
        3: lambda: list(env_after['out']) == [0.0, 0.0, 3.0, 0.0] and expected == '[0.0, 0.0, 3.0, 0.0]',
        4: lambda: float(env_after['total']) == 3.0 and expected == '3.0',
    }
    return step_map.get(step_idx, lambda: False)()

def verify_q_m8_004(env, step_idx, expected, env_after):
    """Logistic:5 → z;6 → p three decimals;7 → y_pred"""
    step_map = {
        5: lambda: abs(float(env_after['z']) - 1.0) < 1e-9 and expected == '1.0',
        6: lambda: round(float(env_after['p']), 3) == 0.731 and expected == '0.731',
        7: lambda: env_after['y_pred'] == 1 and expected == '1',
    }
    return step_map.get(step_idx, lambda: False)()

def verify_q_m8_005(env, step_idx, expected, env_after):
    """DBSCAN:2 → points.shape;9 → counts (after for-loop ends, labels=[] initialized);15 → labels"""
    step_map = {
        2: lambda: tuple(env_after['points'].shape) == (5, 2) and expected == '(5, 2)',
        9: lambda: env_after['counts'] == [2, 3, 3, 2, 0] and expected == '[2, 3, 3, 2, 0]',
        15: lambda: env_after['labels'] == ['border', 'core', 'core', 'border', 'noise']
                    and expected == "['border', 'core', 'core', 'border', 'noise']",
    }
    return step_map.get(step_idx, lambda: False)()

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

def main():
    data = json.loads(QFILE.read_text(encoding='utf-8'))
    questions = data['questions']
    total = 0
    passed = 0
    errors = []

    for q in questions:
        qid = q['id']
        verifier = VERIFIERS.get(qid)
        if verifier is None:
            errors.append(f"{qid}: no verifier registered (add to VERIFIERS dict)")
            continue
        for step in q['trace_steps']:
            total += 1
            after_line = step['after_line']
            try:
                expected = expected_text_of(step)
            except ValueError as e:
                errors.append(f"{qid} step after_line={after_line}: {e}")
                continue
            try:
                env_after = execute_to_line(q['code_block'], after_line)
            except Exception as e:
                errors.append(f"{qid} step after_line={after_line}: exec failed — {e!r}")
                continue
            try:
                ok = verifier(None, after_line, expected, env_after)
            except Exception as e:
                errors.append(f"{qid} step after_line={after_line}: verifier raised — {e!r}")
                continue
            if ok:
                passed += 1
            else:
                errors.append(f"{qid} step after_line={after_line}: expected={expected!r} did not match Python execution")

    print(f"mock-mode8-trace.py: PASS={passed}/{total}")
    if errors:
        print("--- errors ---")
        for e in errors:
            print(f"  {e}")
        return 1
    print("all trace_step is_correct answers verified against actual Python execution")
    return 0

if __name__ == '__main__':
    sys.exit(main())
