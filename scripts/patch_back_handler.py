#!/usr/bin/env python3
"""
Adds useStackBackHandler to all Stack screen files that don't already have it.
For each file:
  1. Adds the import line after the last existing import block
  2. Calls useStackBackHandler() as the first hook inside the default-export function
"""
import re, os, sys

APP_DIR = "/home/akhilreddy/health-digital-twin/VitalHealth/app"
HOOK_IMPORT = 'import { useStackBackHandler } from "../hooks/useStackBackHandler";'

# These files are tab screens / layouts / auth screens — don't touch them
SKIP_FILES = {
    "_layout.tsx", "index.tsx", "startup.tsx", "welcome.tsx",
    "signin.tsx", "signup.tsx",
}

SUB_DIR_HOOK_IMPORT = 'import { useStackBackHandler } from "../../hooks/useStackBackHandler";'

def add_hook_to_file(fpath: str, hook_import: str) -> bool:
    with open(fpath, "r", encoding="utf-8") as f:
        src = f.read()

    # Skip if already imported
    if "useStackBackHandler" in src:
        print(f"  [SKIP] already has hook: {fpath}")
        return False

    # ── 1. Inject import ──────────────────────────────────────────────────────
    # Find the last import statement line
    import_lines = [(m.start(), m.end()) for m in re.finditer(r"^import\s+.+?;", src, re.MULTILINE)]
    if not import_lines:
        print(f"  [SKIP] no imports found: {fpath}")
        return False

    last_import_end = import_lines[-1][1]
    src = src[:last_import_end] + "\n" + hook_import + src[last_import_end:]

    # ── 2. Inject hook call ───────────────────────────────────────────────────
    # Find "export default function Foo(...) {" or arrow equiv
    fn_match = re.search(
        r"(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)",
        src
    )
    if not fn_match:
        # Arrow-function style: "const Foo: React.FC... = (...) => {"
        fn_match = re.search(
            r"(const\s+\w+\s*(?::\s*React\.FC[^=]*)?\s*=\s*\([^)]*\)\s*=>\s*\{)",
            src
        )
    if not fn_match:
        print(f"  [WARN] could not locate component function: {fpath}")
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(src)
        return True  # at least import was added

    # Find the first hook-or-state call after the opening brace
    fn_start = fn_match.end()

    # Insert useStackBackHandler() just after opening brace + first newline
    hook_call = "\n  useStackBackHandler();"

    # Look for existing `const router = useRouter();` or first `const`/`use` call
    after_fn = src[fn_start:]
    first_hook_match = re.search(r"\n\s*(const\s+|use\w+)", after_fn)
    if first_hook_match:
        insert_pos = fn_start + first_hook_match.start()
        src = src[:insert_pos] + hook_call + src[insert_pos:]
    else:
        # just insert right after {
        src = src[:fn_start] + hook_call + src[fn_start:]

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"  [OK ] patched: {os.path.relpath(fpath)}")
    return True


def process_dir(dirpath: str, hook_import_str: str):
    for entry in sorted(os.listdir(dirpath)):
        fpath = os.path.join(dirpath, entry)
        if os.path.isfile(fpath) and fpath.endswith(".tsx") and entry not in SKIP_FILES:
            add_hook_to_file(fpath, hook_import_str)


print("=== Patching app root screens ===")
process_dir(APP_DIR, HOOK_IMPORT)

print("\n=== Patching family sub-screens ===")
process_dir(os.path.join(APP_DIR, "family"), SUB_DIR_HOOK_IMPORT)

print("\n=== Patching session sub-screens ===")
process_dir(os.path.join(APP_DIR, "session"), SUB_DIR_HOOK_IMPORT)

print("\n=== Patching brain sub-screens ===")
process_dir(os.path.join(APP_DIR, "brain"), SUB_DIR_HOOK_IMPORT)

print("\nDone.")
