This folder mirrors existing models while we gradually migrate code into `src/`.
For now, some files re-export root models to minimize churn. Once migration completes,
we will delete root-level duplicates and update imports to point only to `src/`.


