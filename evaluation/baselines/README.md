# Evaluation baselines

Never create a baseline from the deterministic fixture adapter. A baseline must come from a reviewed live Claude Agent SDK run with actual usage metadata and documented case selection.

1. Run the live GitHub Actions workflow with Anthropic credentials configured.
2. Review the JSON report and optional semantic report.
3. Save the reviewed report as current.json, set approved to true, and keep its measured pass_rate_percent; optionally record cost_usd_per_case and regression thresholds.
4. Document the model, source commit, cases, and repeat count.

Until a reviewed measured baseline exists, regression comparison reports NOT RUN rather than inventing a starting score.
