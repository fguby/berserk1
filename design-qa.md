# Design QA

Target: Berserk AI 格式/尺寸修改器，1 号专业分栏型方案。

Prototype capture: `/tmp/berserk-ai-size-editor-v1.png`
Reference capture: `/Users/midoriya/.codex/generated_images/019e5e57-33e6-76d3-a811-5a4576c48585/ig_031456dc173a10d4016a2012de65608191bcaa7980b5d32c80.png`

Findings:
- Passed: left control rail uses upload, original size when available, format segmented control, width/height inputs, aspect lock, and export button only.
- Passed: preset ratio cards are removed.
- Passed: preview area dominates the layout with a calm checkerboard surface.
- Passed: no visible overflow in the checked desktop viewport.
- Passed: console error count was 0 during browser verification.

final result: passed
