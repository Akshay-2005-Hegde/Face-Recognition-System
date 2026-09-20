# Dataset folder (empty by design)

This project ships with **no bundled face images or dataset** — you provide
your own, with proper consent, so the evaluation numbers this system reports
are honest and specific to your data instead of borrowed from a dataset with
its own separate license terms.

Populate this folder like so before running `evaluation/evaluate.py`:

```
data/
  enrollment/
    alice/       1-5 images of Alice used to build her enrollment gallery
      img1.jpg
      img2.jpg
    bob/
      img1.jpg
  test/
    alice/       DIFFERENT images of Alice (not copies of enrollment images)
      probe1.jpg
    bob/
      probe1.jpg
  unknown/       images of people who are NOT enrolled anywhere above
    stranger1.jpg
    stranger2.jpg
```

See the README's "Dataset" and "Evaluation" sections for why this split
matters (avoiding data leakage) and how `evaluate.py` uses it.
