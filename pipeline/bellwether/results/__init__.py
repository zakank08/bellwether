"""Election-night results: readers for state result feeds, merged into one live file.

Each reader turns one state's official feed into `RaceResult` rows. The worker (`worker.py`) runs the readers,
checks the numbers, applies hand corrections, and writes `results.json` and `status.json` for the website."""
