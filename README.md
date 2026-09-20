# Aperture — Face Recognition Identification System

A complete, **$0-cost**, open-source face enrollment and identification
system: enroll people from photos, then identify new faces against the
enrollment database with a calibrated similarity threshold and explicit
"Unknown" rejection.

This is an academic/demonstration-grade system, not a certified biometric
product. See [Limitations](#limitations) and [Ethical Use](#ethical-use--privacy)
before using it on real people.

---

## Project Overview

Aperture lets you:
- Enroll a person from 1–10 photos (front-facing + a few varied angles/expressions/lighting recommended).
- Identify a face in a new photo or webcam capture by comparing it against every enrolled person.
- See a similarity score and a clear **Recognized / Unknown** verdict — the system never forces a match onto the closest person if nobody is similar enough.
- Manage the enrollment database (view samples, delete people).
- Run a real evaluation script against your own labeled data to measure accuracy, FAR/FRR, and pick a justified threshold — no fabricated numbers.

## Features

- Face detection + 5-point alignment + embedding in one pretrained pipeline (no training required).
- Quality gating at enrollment and recognition time: rejects no-face, multi-face-when-one-expected, too-small, low-confidence, and blurry images with a specific reason.
- Multi-sample enrollment per person with max-similarity matching across all of a person's samples.
- SQLite storage of embeddings + small preview thumbnails only — raw uploaded photos are discarded after processing.
- REST API (FastAPI) + a dependency-free HTML/CSS/JS frontend (dashboard, enroll, identify with bounding boxes, people manager, evaluation viewer).
- A standalone evaluation script producing genuine/impostor similarity distributions, FAR/FRR, EER-based threshold selection, accuracy/precision/recall/F1.
- Webcam capture support in-browser (no extra native app needed).

---

## Architecture

```
Image (upload or webcam frame)
        ↓
Face Detection (RetinaFace, bundled in InsightFace buffalo_l)
        ↓
5-point Landmark Alignment (bundled)
        ↓
Quality Gate (detector confidence, face size, blur)
        ↓
ArcFace Embedding Model → 512-d vector
        ↓
L2 Normalization
        ↓
Cosine Similarity vs. every stored embedding
        ↓
Best match = argmax(similarity) per person (max over that person's samples)
        ↓
similarity ≥ threshold ?
      ↙                ↘
 Recognized          Unknown
```

**Backend:** Python + FastAPI, serving both the REST API and the static frontend.
**Computer vision:** OpenCV (I/O, blur/quality checks) + InsightFace/ONNX Runtime (detection + embedding).
**Database:** SQLite (single file, zero external service).
**Frontend:** Vanilla HTML/CSS/JS (no build step) — chosen deliberately over a React/Vite pipeline. A modern SPA framework buys componentization we don't need for five views, at the cost of a build step, node_modules, and an extra deployment stage. Plain JS keeps "clone → pip install → run" as the entire setup, which matters for a $0, easy-to-grade academic deliverable. If you want to extend this into a larger product, migrating `app.js`'s logic into React components later is straightforward since the API is already framework-agnostic.

---

## Model Used

| | |
|---|---|
| **Package** | [InsightFace](https://github.com/deepinsight/insightface) `buffalo_l` model pack |
| **Detector** | RetinaFace (ResNet-based), bundled |
| **Embedding architecture** | ArcFace, ResNet100 backbone |
| **Embedding dimensionality** | 512 |
| **Pretraining source** | Trained on Glint360K (a large public academic face-recognition dataset); distributed via InsightFace's official GitHub model zoo |
| **License** | InsightFace code is MIT-licensed; the bundled pretrained models are released by the InsightFace project for **non-commercial research use** — see [insightface/blob/master/LICENSE](https://github.com/deepinsight/insightface/blob/master/model_zoo/README.md) before any commercial deployment |
| **Download** | Automatic on first run, from InsightFace's GitHub release assets (`buffalo_l.zip`, ~280 MB), cached locally afterward — fully offline after that |

### Why this model, and not the alternatives listed in the brief

- **vs. dlib / `face_recognition` library:** dlib's ResNet embeddings (128-d) are older and generally score lower on modern face-verification benchmarks than ArcFace; dlib also requires a C++ compile step that frequently fails on constrained or Windows environments, hurting "ease of deployment."
- **vs. FaceNet (TensorFlow triplet-loss models):** Good accuracy, but most freely available FaceNet checkpoints are older, less consistently maintained, and still need a separate detector (e.g., MTCNN) wired in manually. InsightFace bundles detector + aligner + embedder as one maintained package.
- **vs. MediaPipe:** MediaPipe's face detector is excellent and very fast, but MediaPipe does not ship an open face-*recognition* (identity) embedding model — only detection/mesh/landmarks. It's complementary, not a substitute, for this task's core requirement.
- **vs. MobileFaceNet:** A good lightweight option for edge/mobile CPUs, but at some accuracy cost. Since this project's constraint is "$0 and runs on commodity hardware," not "runs on a phone," buffalo_l's larger ResNet100 backbone was preferred for higher accuracy; buffalo_s or buffalo_sc (smaller InsightFace packs) are drop-in replacements (`FaceEngine(model_name="buffalo_s")`) if you need faster inference on weak hardware — this trade-off is worth knowing about even though the default here favors accuracy.

**Expected strengths:** robust to moderate pose/lighting/expression variation, strong published benchmark performance for a free model, fast enough for CPU inference (detect+embed ≈ 0.3–0.6s per image in our testing, see [Performance](#performance)).

**Known limitations:** performance degrades on extreme pose (>45°), heavy occlusion (masks, most of the face covered), very low resolution/tiny faces, and can vary across demographic groups and imaging conditions not well represented in its training data — see [Failure Cases](#failure-cases).

---

## Matching Method

- Every stored and every query embedding is **L2-normalized**, so cosine similarity reduces to a plain dot product (`FaceEngine.cosine_similarity`).
- **Enrollment strategy:** each accepted enrollment image is stored as its own embedding row (not collapsed into a single centroid). A centroid helper (`FaceEngine.centroid`) exists for summary/dashboard use, but matching does **not** use it as the primary method.
- **Matching strategy: max-similarity across a person's samples.** For a query face, a person's score is `max(cosine_sim(query, sample) for sample in that person's stored samples)`. This was chosen over "compare to the centroid only" because averaging embeddings from different poses/lighting can pull the centroid toward a vector that matches *none* of the real captures as well as the single best real capture does — multi-template max-similarity is simpler to implement than covariance-aware fusion and is a standard, well-documented practical compromise for small enrollment galleries. The trade-off: it's more compute per query (O(total stored samples) instead of O(people)), which is a non-issue at this project's scale (see [Improvements](#improvements) for scaling to large galleries with ANN search).
- The **best-scoring person overall** is the candidate identity; it is only returned if its score clears the threshold.

---

## Threshold

**Shipped default: cosine similarity ≥ `0.38`** (set in `backend/main.py::DEFAULT_THRESHOLD`).

This default is **explicitly labeled as a starting point**, not a validated result — it sits in the range commonly reported as reasonable for ArcFace-style cosine embeddings, but it was not tuned on your specific enrolled population. **You must run the evaluation script against your own data to get a threshold backed by evidence for your use case.**

### How to actually determine your threshold

```bash
python evaluation/evaluate.py --data-dir data --write-to-db
```

This script (`evaluation/evaluate.py`):
1. Embeds every enrollment image and every test image.
2. Computes **genuine-pair** similarities (test image of person X vs. person X's enrollment gallery).
3. Computes **impostor-pair** similarities (test image of person X vs. every *other* enrolled person's gallery, plus any images under `data/unknown/`).
4. Scans 181 threshold values between -1 and 1 and picks the one minimizing `|FAR − FRR|` (an approximate Equal Error Rate operating point).
5. Reports FAR, FRR, accuracy, precision, recall, F1 at that threshold.
6. With `--write-to-db`, writes the result into the backend's SQLite config, so the running app immediately uses the new threshold and the Evaluation tab shows real numbers.

### Informal correctness check performed during development

Using two small, distinct, public-domain sample images (not a real evaluation dataset — see caveat below) to sanity-check the *code path*, not to claim a validated threshold:

| Pair type | Similarity |
|---|---|
| Genuine (same identity, rotated + relit) | 0.94 |
| Genuine (identical re-submission) | 1.00 |
| Impostor (two different identities) | −0.03 |

This is a strong, clean separation around the 0.38 default and confirms the embedding/matching pipeline is functioning correctly end-to-end — enrollment, storage, retrieval, cosine similarity, and thresholding all behave as intended. **It is not a substitute for real evaluation**: two samples cannot estimate FAR/FRR with any statistical confidence, so no accuracy/FAR/FRR percentages are claimed from it. Run `evaluate.py` on a real dataset before trusting any specific number.

### FAR/FRR trade-off

```
Lower threshold  → fewer missed genuine matches → higher false-accept risk (impostors let through)
Higher threshold → stronger impostor rejection   → higher false-reject risk (genuine users rejected)
```
Pick your operating point based on the cost of each error type for your use case (e.g., a low-stakes photo-tagging tool can tolerate more false accepts than an access-control gate).

---

## Recognition Pipeline — Design Decisions

- **Multiple faces in one image:** all detected faces are processed and returned independently (bounding box + identity + score each), rather than forcing the user to pick one first. This was chosen over "select one face" because it's strictly more informative and no harder to implement once detection returns a list — the UI simply loops over the results and draws one box per face.
- **Unknown rejection is mandatory and structural**, not a UI afterthought: the `/recognize` endpoint always computes `is_known = best_similarity >= threshold` server-side and returns `"Unknown"` with the (sub-threshold) similarity value when no one clears the bar — the frontend cannot "force" a match.
- **Quality gate is centralized** in `face_engine.py` and applied identically during enrollment and recognition, so a blurry/too-small/low-confidence face is rejected the same way in both flows instead of only being caught in one.

---

## Dataset

**No dataset ships with this repository.** `data/enrollment`, `data/test`, and `data/unknown` are empty on purpose (see `data/README.md`), for two reasons: (1) real face datasets carry their own licenses that shouldn't be silently bundled into a downstream project, and (2) the evaluation numbers reported by this system should come from data you have consent to use.

**Split methodology (enforced by folder structure, not just documentation):**
- `enrollment/<name>/` — used only to build each person's gallery.
- `test/<name>/` — **different photos** of the same people, used as genuine probes. Never point this at the same files as `enrollment/`; `evaluate.py` cannot detect accidental duplicates, so avoiding leakage is the user's responsibility (documented here explicitly).
- `unknown/` — photos of people who appear nowhere in `enrollment/`, used to measure real unknown-rejection behavior and contribute additional impostor trials.

During development, two small public-domain sample images from the `scikit-image` package (not redistributed in this repo) were used purely to smoke-test the code paths described above — that is a functional test, not a dataset evaluation, and is reported as such.

---

## Evaluation Results

**Status: pending — no results are fabricated here.**

Run:
```bash
python evaluation/evaluate.py --data-dir data --write-to-db
```
against your own populated `data/` folder, and this section (and the app's Evaluation tab) will report real:
- Accuracy, Precision, Recall, F1
- Genuine and impostor similarity distributions (mean/std)
- FAR, FRR at the selected threshold
- Unknown-rejection performance (from `data/unknown/`)

The script explicitly reports **"insufficient data"** instead of a number when there aren't enough genuine or impostor pairs to compute a metric meaningfully (e.g., only one enrolled identity → no impostor pairs → FAR/EER cannot be computed).

---

## Failure Cases

Explicitly expected weaknesses of this pipeline (not hidden):
- **Very low light / heavy backlighting:** detector confidence drops; frames may be rejected outright by the quality gate rather than silently mismatched.
- **Extreme pose (side profile, > ~45° yaw):** alignment quality degrades; embeddings become less reliable.
- **Heavy occlusion** (large masks, hands over the face, sunglasses covering a large facial area): may fail detection entirely, or align poorly.
- **Blurred / tiny / far-away faces:** rejected by the built-in blur and minimum-face-size checks rather than producing an unreliable match.
- **Multiple faces very close together / overlapping:** RetinaFace generally separates distinct faces well, but tightly overlapping crowds can still cause missed or merged detections.
- **Visually similar individuals** (e.g., close relatives, identical twins): cosine similarity between different people's embeddings can occasionally exceed the threshold; no face-embedding system fully solves this.
- **Poor enrollment images:** if all enrollment photos for a person share the same bad angle/lighting, recognition under different real-world conditions will be weaker — multi-sample enrollment mitigates but does not eliminate this.
- **Demographic/appearance variation not well represented in the model's training data:** accuracy is not guaranteed to be uniform across all skin tones, ages, or facial-hair/head-covering styles; this is a documented, known characteristic of face-recognition models trained on non-uniform public datasets.

## Limitations

- This is a **verification/identification aid**, not a certified biometric system — do not use it as the sole basis for high-stakes decisions (legal, financial, security-critical access control) without independent, representative validation and human review.
- The shipped `0.38` threshold is a **default**, not a number validated for your population — see [Threshold](#threshold).
- Matching is O(total enrolled samples) per query; fine for hundreds–low thousands of people, not optimized for very large galleries (see Improvements).
- No liveness/anti-spoofing detection: a printed photo or a screen replay of an enrolled person's face can currently pass as that person. Do not use this system alone for anything where spoofing is a real threat.
- Single-node SQLite storage: not designed for concurrent multi-writer production load out of the box.

## Improvements

Realistic next steps, in rough priority order:
- Liveness detection / anti-spoofing (blink detection, texture analysis, or a dedicated open-source anti-spoofing model) before treating a match as sufficient for access control.
- Approximate nearest-neighbor indexing (e.g., FAISS, HNSW) once the gallery grows past a few thousand samples, to keep `/recognize` fast without brute-force comparison.
- Quality-aware enrollment scoring (reject not just "no face" but rank enrollment photos and suggest the best ones to keep).
- Larger, demographically representative evaluation dataset with informed consent, run through `evaluate.py`, to replace the default threshold with a validated one.
- Encryption at rest for the SQLite file, and role-based access control on the API if this moves beyond a local/academic deployment.
- Better alignment (3D-aware alignment) for more extreme head poses.
- Optional confidence calibration (turning raw cosine similarity into a calibrated probability) for easier interpretation by non-technical users.

---

## Ethical Use & Privacy

This is a biometric identification system; treat it accordingly:
- **Obtain consent** from anyone before enrolling their face.
- **Do not use this for covert surveillance** — enrolled individuals should know they are enrolled and can ask to be removed.
- **Biometric data is sensitive.** This system stores embeddings and small preview thumbnails, not raw photos, and never sends any image or embedding to a third-party or paid API — all processing is local/server-side under your control.
- **Recognition errors have real consequences** for the people involved; a false match or false rejection is not a "no big deal" bug in a deployed identity system.
- **Do not treat this as an authoritative identity-verification mechanism** — it is a demonstration/academic-grade aid, not a legally or forensically validated system.
- **Performance may vary across demographic groups and environmental conditions**; evaluate on data representative of your actual deployment population before relying on it for anything consequential.
- **Provide a way to delete data:** the People tab's Delete button permanently removes a person's embeddings and thumbnails (`DELETE /people/{id}` cascades in SQLite).

---

## Minimal Project Structure

```
face-recognition-system/
├── backend/
│   ├── main.py            FastAPI app: enroll/recognize/people/evaluation endpoints
│   ├── face_engine.py     Detection + alignment + embedding + quality gating
│   ├── database.py        SQLite schema and queries
│   └── requirements.txt
├── frontend/
│   ├── index.html         Dashboard / Enroll / Identify / People / Evaluation views
│   ├── styles.css
│   └── app.js             Fetch-based API calls, canvas bounding-box drawing, webcam capture
├── evaluation/
│   └── evaluate.py        Genuine/impostor similarity analysis, FAR/FRR, threshold search
├── data/
│   ├── README.md          Expected dataset layout (folder ships empty)
│   ├── enrollment/
│   ├── test/
│   └── unknown/
├── README.md
└── .gitignore
```

---

## Installation

Requirements: **Python 3.10–3.12**, ~500 MB free disk (model download + dependencies), no GPU required.

```bash
git clone <this-repo-url>
cd face-recognition-system
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

The first time you start the backend, InsightFace automatically downloads the `buffalo_l` model pack (~280 MB) from its GitHub release assets and caches it under `~/.insightface/models/` — this requires internet access once; every run after that is fully offline.

## Running Locally

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open **http://localhost:8000** — the backend serves the frontend directly (no separate frontend server or build step needed).

Interactive API docs (auto-generated by FastAPI): **http://localhost:8000/docs**

## Deployment

**Recommended: keep it local or on your own machine/VM.** Free hosting platforms (Render free tier, Fly.io free allowance, Railway free tier, etc.) can run this backend, but be aware of real constraints before promising "free deployment":
- Free web-service tiers typically give 512 MB–1 GB RAM; InsightFace + onnxruntime + the model comfortably fit, but cold starts will be slow (model load + possible first-time model download can take 10–30+ seconds).
- Free tiers commonly **sleep on inactivity** and spin down, so a genuinely 24/7 "always-warm" free deployment is not realistic — say this plainly to anyone expecting instant response after idle time.
- Webcam capture requires HTTPS in most browsers except on `localhost` — any free host that provides HTTPS out of the box (Render, Fly.io, Railway all do) satisfies this; plain HTTP hosting will break the webcam tab.
- Persisted SQLite data on most free-tier ephemeral filesystems **does not survive redeploys** unless you attach a persistent volume (not all free tiers offer one) — for anything beyond a demo, back up `backend/data/face_recognition.db` or use a host with a free persistent disk.

**Concrete steps for a typical free container host (e.g., Render's free web service):**
1. Push this repo to GitHub.
2. Create a new "Web Service" from the repo, root directory `backend`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Confirm the platform's free tier includes at least 512 MB RAM (check current docs, since free-tier specs change).
6. If the platform offers a free persistent disk, mount it at `backend/data/` so enrollment data survives restarts; otherwise treat every redeploy as starting from an empty database.

If you find a specific free host's exact current limits, check its own pricing/docs page before committing — free-tier terms change often enough that this README won't try to pin exact numbers that could go stale.

## Backend API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/enroll` | form fields `name`, `external_id?`, `files[]` → enroll a person |
| POST | `/recognize` | form field `file` → detect + identify all faces in an image |
| GET | `/people` | list enrolled people with sample counts |
| GET | `/people/{id}` | person detail + thumbnail ids |
| GET | `/people/{id}/thumbnail/{thumb_id}` | raw JPEG preview thumbnail |
| DELETE | `/people/{id}` | delete a person and all their embeddings/thumbnails |
| GET | `/evaluation` | last evaluation report, or an explicit "not run yet" message |
| POST | `/evaluation/threshold?value=0.4` | manually override the active match threshold |
| GET | `/dashboard` | summary counters for the UI dashboard |
| GET | `/health` | model/database health check |

Full interactive documentation is auto-served at `/docs` while the backend is running.

## Performance

Measured on this project's development machine (CPU-only, containerized Linux environment, no GPU):

| Stage | Time (single face, single image) |
|---|---|
| Model load (once, at startup) | ~8 s |
| Detect + align + embed | ~0.3–0.6 s |
| Matching against a small gallery (2 people) | ~1–2 ms |

These numbers will vary with your hardware, image resolution, and gallery size, and are reported here as a rough reference, not a guaranteed SLA — re-measure on your own deployment target for anything performance-sensitive.

---

## Testing Checklist (verified during development)

- [x] Enroll a new person with a valid single-face image → embedding generated and persisted.
- [x] Enrollment correctly rejects a no-face image with a clear reason.
- [x] Recognize a genuine (same-identity, transformed) image → correctly matched, high similarity (0.94–1.00 in smoke test).
- [x] After deleting the matched person, the same probe image correctly falls back to "Unknown" against the remaining gallery (similarity dropped to −0.03, well below threshold) — confirms delete cascades embeddings and thresholding works.
- [x] No-face image sent to `/recognize` → empty `faces: []` with a clear message, no crash.
- [x] Non-image file sent to either endpoint → clean 4xx error, no stack trace exposed.
- [x] Thumbnail endpoint serves a real, small (112×112) JPEG.
- [x] Data persists across a full backend restart (SQLite file on disk).
- [x] `evaluation/evaluate.py` runs end-to-end on a toy 2-identity dataset and produces a coherent report (threshold search, FAR/FRR, accuracy) with `report.json` written to disk.
- [ ] Multi-face-in-one-image handling — implemented and logically straightforward (detector already returns a list; each face is quality-gated and matched independently) but not verified against a real multi-face photograph in this environment due to lack of a suitable licensed test image; **verify this on your own multi-person photo before relying on it.**
- [ ] Full FAR/FRR/EER statistics on a real, multi-identity, properly licensed dataset — architecture and script are complete and tested on a toy case; **run `evaluate.py` on your real data to get a validated threshold, per the Threshold section above.**

---

## Known Limitations and Future Improvements

See [Limitations](#limitations) and [Improvements](#improvements) above.
