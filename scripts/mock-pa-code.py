"""
Round 4A retrofit verification harness.

For every code_reading question that has stem_variables.case_*, substitute the
case values into code_block and run via `python -c`. Compare stdout against the
case-provided `answer` string. Any mismatch = FAIL.

Usage:
    python scripts/mock-pa-code.py

Exit codes:
    0  PASS all
    1  >= 1 FAIL
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FILES = [
    'src/questions-pa-code.json',
    'src/questions-batch-n7-dl.json',
    'src/questions.json',
    # 2026-05-16 iter 5 暫緩:L22 code_reading 3 檔(n22/n23/n24)初試加入 audit 後抓到
    # 9 題 / 19+ case 真 bug(雙花括號 / ellipsis / 多 print / format / imblearn 缺),
    # 範圍超出 autonomous polish 工作,撤回 FILES 擴充避免 CI 破裂。
    # 詳見 docs/needs-review-l22-code.md。後續派 Worker dispatch 處理:
    # 'src/questions-batch-n22-L22-code-data.json',
    # 'src/questions-batch-n23-L22-code-ml.json',
    # 'src/questions-batch-n24-L22-code-gen.json',
]


def sub(text, case):
    """Replace {key} placeholders with case[key]."""
    out = text
    for k, v in case.items():
        out = out.replace('{' + k + '}', str(v))
    return out


def normalize(s):
    """Strip whitespace for resilient comparison."""
    return ''.join(s.split())


def main():
    pass_count = 0
    fail_count = 0
    fails = []
    questions_with_cases = 0

    for rel in FILES:
        fp = ROOT / rel
        if not fp.exists():
            fails.append(f"MISSING FILE: {rel}")
            fail_count += 1
            continue
        data = json.loads(fp.read_text(encoding='utf-8'))
        questions = data.get('questions', data) if isinstance(data, dict) else data
        for q in questions:
            if q.get('format') != 'code_reading':
                continue
            sv = q.get('stem_variables')
            if not sv:
                continue  # retrofit-only — non-retrofitted questions skipped
            questions_with_cases += 1
            cases = {k: v for k, v in sv.items() if k.startswith('case_')}
            # Key-set consistency check
            key_sets = [frozenset(v.keys()) for v in cases.values()]
            if len(set(key_sets)) != 1:
                fail_count += 1
                fails.append(
                    f"{q['id']}: case keys not consistent: " +
                    "; ".join(f"{k}={sorted(cases[k].keys())}" for k in cases)
                )
                continue
            code_block = q.get('code_block', '')
            for case_key, case_vals in cases.items():
                expected = str(case_vals.get('answer', ''))
                code_substituted = sub(code_block, case_vals)
                # Sanity: no residual {placeholder}
                if '{' in code_substituted and '}' in code_substituted:
                    import re
                    residual = re.findall(r'\{[a-zA-Z_][a-zA-Z0-9_]*\}', code_substituted)
                    if residual:
                        fail_count += 1
                        fails.append(
                            f"{q['id']}/{case_key}: residual placeholders in code_block: {residual}"
                        )
                        continue
                try:
                    r = subprocess.run(
                        ['python', '-c', code_substituted],
                        capture_output=True, text=True, timeout=20
                    )
                    actual = r.stdout.strip()
                    if normalize(actual) == normalize(expected):
                        pass_count += 1
                    else:
                        fail_count += 1
                        stderr_tail = r.stderr.strip()[-300:] if r.stderr else ''
                        fails.append(
                            f"{q['id']}/{case_key}: expected={expected!r}, got={actual!r}, "
                            f"stderr={stderr_tail!r}"
                        )
                except subprocess.TimeoutExpired:
                    fail_count += 1
                    fails.append(f"{q['id']}/{case_key}: TIMEOUT (>20s)")
                except Exception as e:
                    fail_count += 1
                    fails.append(f"{q['id']}/{case_key}: EXCEPTION {type(e).__name__}: {e}")

    print(f"questions with stem_variables.case_*: {questions_with_cases}")
    print(f"PASS={pass_count}  FAIL={fail_count}")
    if fails:
        print(f"--- failures (first 30 of {len(fails)}) ---")
        for line in fails[:30]:
            print("  -", line)
    return 0 if fail_count == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
