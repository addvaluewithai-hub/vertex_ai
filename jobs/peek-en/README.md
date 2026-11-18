# Peek English Shorts: character lock

Step 1 of the cinematic 3D Shorts (plan: `channel-earth-report/plan/peek-english.md`). Each file is one image job,
saved as a dry-run. To produce one, change `mode` to `produce` and run it (Actions → Vertex AI Media Factory →
Run workflow, paste the JSON), with the owner's approval.

| Job | Output |
|---|---|
| `01-peek-turnaround` | Peek in 3D: front, three-quarter, side, back (16:9) |
| `02-peek-expressions` | six expressions (1:1) |
| `03-agent-turnaround` | Agent Crowe, the government agent who hunts him (16:9) |
| `04-keyframe-disguise` | a test film still: Peek in disguise at a night bus stop (9:16) |

Once 01 and 03 are approved, commit them to `refs/` and point every later job at them instead of the flat poses.
