# Aperture — Face Recognition Identification System

Aperture is a local-first face recognition and identification system built with **Python, FastAPI, InsightFace, OpenCV, SQLite, HTML, CSS, and JavaScript**.
**Live Demo Link:** (https://glorious-space-robot-694x667gqwrq345rx-8000.app.github.dev/)


note:- as a limitation of github codespace it will run 4 hours , if closed link will not work if current link does not work run manually with below given instructions
The system allows authorized users to:

* Enroll people using multiple face images.
* Capture enrollment images directly from a webcam.
* Upload enrollment images from the computer.
* Recognize faces from uploaded images.
* Recognize faces using a webcam.
* Manage enrolled people and their biometric samples.
* Adjust the face-matching similarity threshold.
* Run an evaluation against the live enrollment database.
* View FAR, FRR, accuracy, precision, recall, F1, similarity distributions, and threshold curves.
* Explicitly classify faces as **Recognized** or **Unknown** rather than always forcing the closest match.

The project is designed primarily for **academic, demonstration, and local development use**.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [System Architecture](#system-architecture)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Face Recognition Pipeline](#face-recognition-pipeline)
7. [Face Model](#face-model)
8. [Enrollment](#enrollment)
9. [Webcam Enrollment](#webcam-enrollment)
10. [Recognition](#recognition)
11. [Matching and Threshold](#matching-and-threshold)
12. [Quality Checks](#quality-checks)
13. [Database](#database)
14. [Evaluation System](#evaluation-system)
15. [Installation](#installation)
16. [Running the Project](#running-the-project)
17. [Using the Web Interface](#using-the-web-interface)
18. [Running Evaluation Manually](#running-evaluation-manually)
19. [Windows Setup](#windows-setup)
20. [Linux/macOS Setup](#linuxmacos-setup)
21. [Troubleshooting](#troubleshooting)
22. [Evaluation Data Requirements](#evaluation-data-requirements)
23. [Privacy and Data Storage](#privacy-and-data-storage)
24. [Security and Ethical Use](#security-and-ethical-use)
25. [Current Evaluation Status](#current-evaluation-status)
26. [Limitations](#limitations)
27. [Future Improvements](#future-improvements)

---

# Project Overview

Aperture is a CPU-based face recognition application that performs face detection, face alignment, feature extraction, and similarity-based identity matching locally.

The backend is implemented using **FastAPI**. The frontend is a dependency-free HTML/CSS/JavaScript interface served by the FastAPI application.

The recognition engine uses the **InsightFace `buffalo_l` model**, which provides:

* Face detection.
* Facial landmark detection.
* Face alignment.
* ArcFace face embeddings.

The resulting face representation is a **512-dimensional L2-normalized vector**. The system compares this vector against the embeddings stored for enrolled people.

The backend stores biometric embeddings and small preview thumbnails in a local SQLite database. Raw uploaded photographs are not retained after processing.

---

# Features

## Face Enrollment

A person can be enrolled using multiple images.

The current backend supports:

* Minimum enrollment images: **1**
* Maximum enrollment images: **10**
* Upload-based enrollment.
* Webcam-based enrollment.
* Multiple samples for the same person.
* Automatic external ID generation when an ID is not supplied.
* Duplicate identity protection.
* Image quality validation.

The frontend also limits webcam captures to 10 images per enrollment.

### Recommended enrollment

For better recognition performance, use several images containing variations such as:

* Slightly different head angles.
* Different facial expressions.
* Different lighting conditions.
* Different distances from the camera.
* Natural variations in appearance.

Avoid:

* Extremely blurry images.
* Very small faces.
* Images containing multiple people.
* Faces that are heavily obstructed.

---

# Webcam Enrollment

The enrollment interface provides a dedicated camera mode.

When the camera mode is selected, the browser requests webcam access using the browser's `getUserMedia()` API.

Captured frames are converted into JPEG images and added to the current enrollment set. The frontend supports up to 10 captured images per enrollment.

### Webcam enrollment workflow

1. Open **Enroll Identity**.
2. Select **Camera**.
3. Allow browser access to the webcam.
4. Enter the person's name.
5. Capture multiple images.
6. Review the captured images.
7. Submit the enrollment.
8. The backend validates every image.
9. Accepted images are converted into face embeddings.
10. Embeddings and thumbnails are stored in SQLite.

---

# System Architecture

```text
                         APERTURE
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Web Interface     │
                 │ HTML / CSS / JS     │
                 └──────────┬──────────┘
                            │
                            │ HTTP / REST
                            ▼
                 ┌─────────────────────┐
                 │      FastAPI        │
                 │      Backend        │
                 └──────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
      ┌────────────────┐          ┌─────────────────┐
      │  Face Engine   │          │    SQLite DB    │
      │  InsightFace   │          │ embeddings      │
      │  + OpenCV      │          │ thumbnails      │
      └───────┬────────┘          │ people          │
              │                   │ recognition log │
              ▼                   │ configuration   │
       Face Detection             └─────────────────┘
              │
              ▼
       Face Alignment
              │
              ▼
       ArcFace Embedding
              │
              ▼
       512-D Vector
              │
              ▼
       L2 Normalization
              │
              ▼
       Cosine Similarity
              │
              ▼
      Recognized / Unknown
```

---

# Technology Stack

| Component            | Technology              |
| -------------------- | ----------------------- |
| Programming Language | Python 3.12.3           |
| Backend              | FastAPI                 |
| ASGI Server          | Uvicorn                 |
| Face Recognition     | InsightFace             |
| Face Model           | `buffalo_l`             |
| Runtime              | ONNX Runtime            |
| Computer Vision      | OpenCV                  |
| Numerical Processing | NumPy                   |
| Database             | SQLite                  |
| Frontend             | HTML / CSS / JavaScript |
| Charts               | Chart.js                |
| Inference            | CPU                     |

The supplied dependency file pins the project to FastAPI 0.141.1, Uvicorn 0.53.0, NumPy 2.4.4, OpenCV 4.13.0.92, ONNX Runtime 1.24.4, InsightFace 2.0, scikit-learn 1.8.0, Pillow 12.1.1, and python-multipart 0.0.32.

---

# Project Structure

The project is organized into backend, frontend, and evaluation components.

```text
Face-Recognition-System/
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── face_engine.py
│   ├── requirements.txt
│   │
│   └── data/
│       └── face_recognition.db
│
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── evaluation/
│   ├── evaluate.py
│   └── report.json
│
├── .gitignore
└── README.md
```

> File locations should match the actual repository layout. If your local project uses a different folder structure, adjust the commands accordingly.

---

# Main Components

## `backend/main.py`

This is the FastAPI application.

It provides:

* Application startup.
* Model initialization.
* Enrollment API.
* Recognition API.
* People management API.
* Dashboard API.
* Evaluation API.
* Threshold configuration.
* Static frontend serving.

The application initializes the SQLite database and loads the `buffalo_l` face model when the server starts.

---

## `backend/face_engine.py`

This module contains the central face-processing engine.

It wraps InsightFace's `buffalo_l` model and handles:

* Face detection.
* Landmark processing.
* Face embeddings.
* L2 normalization.
* Face quality checks.
* Blur measurement.
* Cosine similarity.

The engine produces **512-dimensional normalized embeddings**.

---

## `backend/database.py`

The database layer uses SQLite.

The database stores:

* People.
* Face embeddings.
* Preview thumbnails.
* Recognition logs.
* Configuration values.

The database is created automatically under the backend data directory.

SQLite was selected because the application is designed for local/academic usage and does not require a separate database server.

---

## `frontend/index.html`

Contains the main user interface.

The interface provides sections for:

* Dashboard.
* Recognition.
* Enrollment.
* People directory.
* Evaluation Lab.

The frontend is served by the FastAPI backend.

---

## `frontend/app.js`

Contains frontend application logic including:

* Navigation.
* API requests.
* Webcam handling.
* Enrollment image management.
* Recognition.
* Dashboard updates.
* Evaluation controls.
* Toast/error messages.

The frontend stops active webcam streams when changing application views to prevent cameras from remaining active unnecessarily.

---

## `frontend/styles.css`

Contains the visual design and responsive styling for the application.

The interface uses a dark control-panel style with dashboard cards, navigation, status indicators, forms, camera controls, and evaluation visualizations.

---

## `evaluation/evaluate.py`

This script evaluates the embeddings currently stored in the live SQLite database.

It calculates:

* Genuine similarity pairs.
* Impostor similarity pairs.
* FAR.
* FRR.
* Threshold curve.
* Equal Error Rate-style threshold point.
* Accuracy.
* Precision.
* Recall.
* F1.
* Confusion matrix.
* Genuine similarity distribution.
* Impostor similarity distribution.

The script can also write the resulting evaluation report back into the database.

---

# Face Recognition Pipeline

For every image, the system performs the following process:

```text
Input Image
     │
     ▼
Face Detection
     │
     ▼
Face Landmark / Alignment
     │
     ▼
Quality Checks
     │
     ├── Failed → Reject
     │
     ▼
ArcFace Embedding
     │
     ▼
L2 Normalization
     │
     ▼
Compare Against Database
     │
     ▼
Maximum Similarity
     │
     ▼
Threshold Comparison
     │
     ├── Score >= threshold → Recognized
     │
     └── Score < threshold  → Unknown
```

---

# Face Model

The project uses the InsightFace:

```text
buffalo_l
```

model pack.

The face engine documentation identifies the model components as:

* RetinaFace-based face detector.
* Five-point facial landmark alignment.
* ArcFace embedding.
* 512-dimensional normalized embedding.

The engine explicitly uses CPU inference through ONNX Runtime.

---

# Matching and Threshold

Aperture uses **cosine similarity** for face comparison.

Because the embeddings are L2-normalized, cosine similarity can be calculated using the dot product.

```text
similarity = dot(query_embedding, stored_embedding)
```

The current default recognition threshold is:

```text
0.38
```

The backend defines:

```python
DEFAULT_THRESHOLD = 0.38
```

and stores the active value in the SQLite configuration table.

## Recognition decision

```text
similarity >= threshold
        │
        ├── YES → Recognized
        │
        └── NO  → Unknown
```

The active threshold can be changed through the Evaluation Lab.

The API accepts threshold values between:

```text
-1.0 and 1.0
```

### Important

Changing the threshold changes the balance between accepting possible matches and rejecting possible matches.

For this reason, threshold selection should ideally be based on evaluation data from the intended dataset rather than choosing a value arbitrarily.

---

# Multiple Samples Per Person

Each enrolled person can have multiple face embeddings.

Instead of creating one embedding and relying exclusively on it, the system compares a query face against the stored samples.

Conceptually:

```text
Person A
 ├── embedding 1
 ├── embedding 2
 ├── embedding 3
 └── embedding 4
```

During recognition, similarity is calculated against the stored embeddings and the strongest matching similarity is used.

This allows the enrollment set to represent some variation in the person's appearance.

---

# Quality Checks

The face engine applies centralized quality checks during both enrollment and recognition.

The current thresholds are:

| Check                           | Current value |
| ------------------------------- | ------------: |
| Minimum detection confidence    |        `0.55` |
| Minimum face-height fraction    |          `6%` |
| Minimum blur/Laplacian variance |          `30` |
| Detector input size             |   `640 × 640` |

These values are defined in `face_engine.py`.

## Detection confidence

Faces with detector confidence below:

```text
0.55
```

are rejected.

---

## Face size

The detected face must occupy at least approximately:

```text
6%
```

of the image height.

This helps reject images where the face is too small or too far away.

---

## Blur detection

The system calculates the variance of the Laplacian on the face crop.

Images with a value below:

```text
30
```

are considered too blurry.

---

## Multiple faces

Enrollment requires exactly one face in every enrollment image.

An image containing multiple faces is rejected rather than arbitrarily selecting one of them.

The backend explicitly reports this condition to the frontend.

---

# Enrollment

## Upload Enrollment

To enroll using existing photographs:

1. Open the application.
2. Select **Enroll Identity**.
3. Select the upload option.
4. Enter the person's name.
5. Optionally provide an external ID.
6. Select multiple photographs.
7. Review the selected images.
8. Click the enrollment button.
9. Wait for the validation results.

Each image is independently processed.

For every image, the backend checks:

```text
Valid image?
      ↓
Face detected?
      ↓
Exactly one face?
      ↓
Good detection confidence?
      ↓
Face large enough?
      ↓
Image sharp enough?
      ↓
Accept image
```

Only accepted samples are stored.

---

# Webcam Enrollment

To enroll using the camera:

1. Open **Enroll Identity**.
2. Select **Camera**.
3. Allow webcam access.
4. Enter the person's name.
5. Position the person's face inside the camera view.
6. Capture several images.
7. Change the person's pose/expression slightly between captures.
8. Review the captured samples.
9. Submit the enrollment.

The browser captures the current video frame into a JPEG image before sending it through the same enrollment pipeline as uploaded images.

---

# Duplicate Prevention

Before a new person is added, the backend compares the accepted enrollment embeddings against the existing gallery.

If a new face is sufficiently similar to an existing enrolled face, enrollment is blocked.

The duplicate threshold is derived from the current recognition threshold:

```text
max(0.15, current_threshold - 0.10)
```

This is intended to reduce accidental duplicate biometric identities.

---

# Recognition

Recognition can process an uploaded image or webcam capture through the frontend.

The backend endpoint is:

```text
POST /recognize
```

The recognition process:

1. Reads the uploaded image.
2. Decodes the image.
3. Detects faces.
4. Generates embeddings.
5. Performs quality checks.
6. Loads enrolled embeddings.
7. Calculates similarity.
8. Finds the best match.
9. Compares the score with the active threshold.
10. Returns the result.

If the score is below the threshold, the result is:

```text
Unknown
```

rather than forcing a match.

The recognition API also returns timing information for detection/embedding and matching.

---

# Database

The application uses SQLite.

The database file is:

```text
backend/data/face_recognition.db
```

The database is created automatically when the application starts.

The database contains tables for:

```text
people
embeddings
thumbnails
recognition_log
config
```

The schema stores people and their biometric embeddings separately and uses foreign keys for relationships.

---

# What is Stored?

The system stores:

### People

```text
id
name
external_id
created_at
```

### Embeddings

```text
person_id
512-dimensional vector
dimension
created_at
```

### Thumbnails

Small JPEG preview images associated with enrolled people.

### Recognition logs

Recognition timestamp, matched person, similarity score, and whether the result was known.

### Configuration

Values such as:

```text
match_threshold
last_evaluation_report
```

---

# Raw Image Storage

Raw enrollment images are processed in memory.

The backend stores the generated embeddings and thumbnails rather than retaining the original uploaded photographs.

This should still be treated as sensitive biometric data because face embeddings can themselves represent biometric information.

---

# Evaluation System

The evaluation system operates on the **live enrollment database**.

It does not require a separate image dataset in the current implementation.

The evaluation script retrieves all currently stored embeddings and groups them by identity.

---

## Genuine Pairs

A genuine pair consists of two different samples belonging to the same identity.

Example:

```text
Akshay image 1
        ↕
Akshay image 2
```

The similarity between the two samples contributes to the genuine distribution.

---

## Impostor Pairs

An impostor pair consists of samples belonging to different identities.

Example:

```text
Akshay image
        ↕
Person B image
```

The similarity contributes to the impostor distribution.

---

# FAR and FRR

The evaluation calculates:

### FAR — False Accept Rate

The proportion of impostor comparisons that are accepted at a particular threshold.

```text
FAR = false accepts / impostor comparisons
```

### FRR — False Reject Rate

The proportion of genuine comparisons that are rejected at a particular threshold.

```text
FRR = false rejects / genuine comparisons
```

The evaluation scans a threshold grid from `-1.0` to `1.0` and calculates FAR and FRR at each point.

---

# Evaluation Metrics

When sufficient data exists, the evaluation report includes:

* Threshold.
* FAR.
* FRR.
* Accuracy.
* Precision.
* Recall.
* F1 score.
* Genuine mean similarity.
* Genuine standard deviation.
* Impostor mean similarity.
* Impostor standard deviation.
* TP.
* TN.
* FP.
* FN.
* FAR/FRR curve.
* Genuine/impostor similarity distributions.

These values are generated from the actual embeddings in the database.

No evaluation numbers should be interpreted as representative of other datasets unless those datasets are actually evaluated.

---

# Evaluation Data Requirements

A meaningful full evaluation requires:

1. At least **two different people**.
2. At least **one person with multiple samples**.
3. Enough samples to generate:

   * genuine comparisons;
   * impostor comparisons.

For example:

```text
Person A
 ├── image 1
 ├── image 2
 └── image 3

Person B
 ├── image 1
 └── image 2
```

This produces:

```text
Genuine pairs:
A1 ↔ A2
A1 ↔ A3
A2 ↔ A3
B1 ↔ B2

Impostor pairs:
A1 ↔ B1
A1 ↔ B2
A2 ↔ B1
A2 ↔ B2
A3 ↔ B1
A3 ↔ B2
```

The current evaluation implementation explicitly reports `insufficient_data` when either the genuine or impostor comparison set is empty.

---

# Installation

## Requirements

Recommended environment:

```text
Python 3.12.3
CPU
```

A GPU is not required.

The supplied dependency file is intended for the project's verified Python environment.

---

# Windows Setup

These instructions are particularly relevant when running the project from Windows PowerShell.

## 1. Open the project folder

Example:

```powershell
cd D:\face-recognition-system
```

Use your actual project path if it is different.

---

## 2. Create a virtual environment

```powershell
python -m venv .venv
```

---

## 3. Activate the virtual environment

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

If activation is successful, the terminal should show something similar to:

```text
(.venv) PS D:\face-recognition-system>
```

---

## 4. Upgrade pip

```powershell
python -m pip install --upgrade pip
```

---

## 5. Install dependencies

If `requirements.txt` is located in the project root:

```powershell
pip install -r requirements.txt
```

If it is located inside `backend`:

```powershell
pip install -r backend\requirements.txt
```

The provided requirements file contains the pinned project dependencies.

---

# Linux/macOS Setup

## 1. Create the virtual environment

```bash
python3.12 -m venv .venv
```

## 2. Activate it

```bash
source .venv/bin/activate
```

## 3. Upgrade pip

```bash
python -m pip install --upgrade pip
```

## 4. Install dependencies

```bash
pip install -r requirements.txt
```

or:

```bash
pip install -r backend/requirements.txt
```

depending on your project layout.

---

# Running the Project

## Important

The FastAPI application imports:

```python
import database as db
from face_engine import FaceEngine
```

and the backend expects the frontend directory relative to the backend.

Therefore, the safest way to start the application is from the **backend directory**.

---

## Windows

From the project root:

```powershell
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Linux/macOS

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

You can also use:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

# Open the Application

Once Uvicorn reports that the server has started, open:

```text
http://localhost:8000
```

The FastAPI application mounts the frontend at the root path.

You can also check:

```text
http://localhost:8000/health
```

The health endpoint reports information such as:

* Backend/model status.
* Model name.
* Embedding dimension.
* Number of enrolled people.
* Number of stored samples.
* Current matching threshold.

---

# First Startup

On the first run, InsightFace may need to download the `buffalo_l` model files.

This can take some time depending on the network connection.

After the model has been downloaded and cached, subsequent startup can use the local model cache.

Allow the first startup to finish before attempting recognition.

---

# Using the Web Interface

After opening:

```text
http://localhost:8000
```

the application provides several workspace sections.

---

## 1. Command Center

The dashboard displays system information and recognition statistics.

Typical information includes:

```text
Total enrolled people
Total face samples
Recognition attempts
Known matches
Unknown detections
Current threshold
```

---

## 2. Recognize

Use the recognition section to:

* Upload an image.
* Use a webcam.
* Detect faces.
* Display bounding boxes.
* Display similarity information.
* Display recognized identities.
* Display `Unknown` results.

---

## 3. Enroll Identity

Use this section to:

* Enter a person's name.
* Optionally provide an external ID.
* Upload images.
* Capture images using the webcam.
* Review enrollment samples.
* Submit the enrollment.

---

## 4. People Directory

The people directory allows the user to inspect enrolled identities and manage stored profiles.

The backend exposes:

```text
GET /people
GET /people/{person_id}
GET /people/{person_id}/thumbnail/{thumb_id}
DELETE /people/{person_id}
```

---

## 5. Evaluation Lab

The Evaluation Lab provides controls for:

* Running evaluation.
* Viewing evaluation metrics.
* Viewing similarity distributions.
* Viewing FAR/FRR curves.
* Adjusting the active recognition threshold.

The threshold endpoint accepts values between:

```text
-1.0
```

and:

```text
1.0
```

---

# Running Evaluation Manually

Make sure the backend has been started at least once so that the SQLite database exists.

Open another terminal.

Activate the virtual environment.

Then run:

```powershell
cd evaluation
python evaluate.py --write-to-db
```

Linux/macOS:

```bash
cd evaluation
python evaluate.py --write-to-db
```

---

## Threshold Grid

The evaluation script defaults to:

```text
201
```

threshold points across:

```text
-1.0 → 1.0
```

You can specify a different number:

```bash
python evaluate.py --threshold-grid 401 --write-to-db
```

---

# Evaluation Output

The evaluation script creates:

```text
evaluation/report.json
```

and, when `--write-to-db` is supplied, stores the latest report in the SQLite configuration table.

When the evaluation succeeds, the calculated threshold can also update the active matching threshold.

When the evaluation does not have enough data, it does **not** replace the active threshold with an invalid evaluation result.

---

# Current Evaluation Status

The supplied `report.json` currently shows:

```text
status: insufficient_data
```

with:

```text
Identities enrolled: 1
Genuine pairs:       1
Impostor pairs:      0
```

The currently recorded identity is:

```text
akshay
```

The evaluation therefore cannot calculate a complete genuine-vs-impostor evaluation yet.

To generate a complete evaluation:

1. Enroll at least two different people.
2. Give each person multiple images where possible.
3. Run evaluation again.

---

# Recommended Evaluation Dataset

For meaningful evaluation, do not use only one image per person.

A better small test database would be:

```text
Person A
 ├── 5 images

Person B
 ├── 5 images

Person C
 ├── 5 images

Person D
 ├── 5 images
```

This gives the evaluation engine substantially more genuine and impostor comparisons.

For stronger evaluation, use images captured under different:

* lighting conditions;
* head poses;
* distances;
* facial expressions;
* backgrounds.

---

# API Endpoints

The backend provides the following primary endpoints.

## Health

```http
GET /health
```

Returns backend/model/database status.

---

## Dashboard

```http
GET /dashboard
```

Returns dashboard statistics.

---

## Enroll

```http
POST /enroll
```

Form fields:

```text
name
external_id
files[]
```

The current backend accepts 1–10 enrollment images.

---

## Recognize

```http
POST /recognize
```

Form field:

```text
file
```

Returns detected faces and recognition results.

---

## List People

```http
GET /people
```

---

## Get Person

```http
GET /people/{person_id}
```

---

## Get Thumbnail

```http
GET /people/{person_id}/thumbnail/{thumb_id}
```

---

## Delete Person

```http
DELETE /people/{person_id}
```

---

## Get Evaluation

```http
GET /evaluation
```

---

## Change Threshold

```http
POST /evaluation/threshold?value=0.38
```

Valid range:

```text
-1.0 ≤ threshold ≤ 1.0
```

---

## Run Evaluation

```http
POST /evaluation/run
```

This executes the evaluation script from the backend.

---

# Troubleshooting

## Error: `Could not import module "main"`

If you see:

```text
ERROR: Error loading ASGI app.
Could not import module "main".
```

make sure you are inside the backend directory.

Correct:

```powershell
cd D:\face-recognition-system\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The command:

```powershell
python -m uvicorn main:app
```

expects `main.py` to be importable from the current Python working directory.

---

# Error: `ModuleNotFoundError`

If you see something such as:

```text
ModuleNotFoundError: No module named 'fastapi'
```

activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

and install dependencies:

```powershell
pip install -r requirements.txt
```

or:

```powershell
pip install -r backend\requirements.txt
```

---

# Webcam Does Not Open

Check:

1. Browser camera permission.
2. Operating-system camera permissions.
3. Whether another application is using the camera.
4. Whether the browser supports `getUserMedia()`.
5. Whether the application is being accessed through an appropriate local origin.

When switching away from a camera-enabled view, the frontend explicitly stops active media tracks.

---

# No Face Detected

Possible causes:

* Face is too small.
* Poor lighting.
* Face is turned too far away.
* Image quality is poor.
* Face is partially obstructed.
* Detection confidence is too low.

Try a clearer image with the face closer to the camera.

---

# Image Rejected as Too Blurry

The face engine uses a Laplacian-variance blur check.

Current minimum:

```text
30
```

Use a sharper image with better focus and less motion blur.

---

# Multiple Faces Detected During Enrollment

Enrollment requires exactly one face per image.

If an image contains:

```text
Person A + Person B
```

the image is rejected.

Crop the image or use a photograph containing only the person being enrolled.

---

# Recognition Always Returns Unknown

Check:

1. Whether anyone has been enrolled.
2. Whether the enrollment images passed quality checks.
3. Whether the query image contains a detectable face.
4. Whether the query image is sufficiently clear.
5. The current recognition threshold.
6. Whether the enrolled person has enough representative samples.

The current threshold is stored in the database and can be changed from the Evaluation Lab.

---

# Recognition Matches the Wrong Person

Possible causes include:

* Insufficient enrollment samples.
* Similar-looking people.
* Poor image quality.
* Extreme pose.
* Poor lighting.
* Occlusion.
* An unsuitable recognition threshold.

Collect more varied enrollment samples and use the evaluation system to examine the similarity distributions before changing the threshold.

---

# Evaluation Says `insufficient_data`

This means the current database does not contain enough information to calculate both genuine and impostor distributions.

At minimum, you need:

```text
2+ identities
```

and:

```text
at least one identity with multiple samples
```

The current evaluation implementation explicitly checks for missing genuine or impostor pairs.

---

# Database Reset

If you want to start with a completely empty enrollment database during development, stop the server and remove:

```text
backend/data/face_recognition.db
```

Then restart the application.

The database will be recreated automatically.

**Warning:** This permanently removes the locally stored enrollment records, embeddings, thumbnails, recognition logs, and configuration.

---

# Privacy and Data Storage

The application is designed for local processing.

The SQLite database stores:

* Identity information.
* Face embeddings.
* Preview thumbnails.
* Recognition logs.
* Configuration.

Raw uploaded images are processed by the backend and are not intentionally retained as original uploads.

However, the stored embeddings and thumbnails are still sensitive biometric information and should be protected accordingly.

Do not commit the database to source control.

The `.gitignore` configuration excludes:

```text
backend/data/
evaluation/report.json
.insightface/
```

along with Python virtual-environment and cache files.

---

# Security and Ethical Use

This project is intended for authorized use.

Before using the system with real people:

* Obtain appropriate consent.
* Inform participants about biometric processing.
* Restrict access to the application.
* Protect the SQLite database.
* Do not expose the API publicly without authentication and authorization.
* Do not use recognition results as the sole basis for high-impact decisions.
* Follow applicable privacy and biometric-data laws and institutional policies.

The project currently does **not** implement comprehensive user authentication or role-based access control.

---

# Limitations

## No Liveness Detection

The current system does not provide a dedicated anti-spoofing/liveness mechanism.

A photograph or replayed image could potentially be presented to the camera and processed as a face.

---

## CPU Inference

The system is configured to use:

```text
CPUExecutionProvider
```

This makes deployment simpler but may be slower than a properly configured GPU implementation.

---

## Dataset Dependence

Recognition performance depends heavily on:

* Image quality.
* Enrollment diversity.
* Camera quality.
* Lighting.
* Pose.
* Occlusion.
* Population represented by the data.

Evaluation results from one dataset should not automatically be treated as representative of another dataset.

---

## No Production Authentication

The current FastAPI application does not provide a complete production authentication/authorization system.

It is therefore better suited to controlled local or academic environments.

---

# Future Improvements

Possible future improvements include:

## Approximate Nearest Neighbor Search

The current implementation compares embeddings directly against the stored gallery.

For much larger galleries, an ANN index such as FAISS or HNSW could improve search performance.

---

## Liveness Detection

Possible additions include:

* Blink detection.
* Head movement challenges.
* Texture analysis.
* Anti-spoofing models.
* Depth-camera support.

---

## Authentication and Authorization

Future production-oriented versions could add:

* User authentication.
* Role-based access control.
* API tokens.
* Audit trails.
* Administrator controls.

---

## Better Evaluation Dataset

A larger multi-person dataset could provide more reliable:

* FAR measurements.
* FRR measurements.
* Threshold analysis.
* Similarity distributions.
* Cross-condition evaluation.

---

# Complete Quick Start

For a fresh Windows installation:

```powershell
# 1. Go to project
cd D:\face-recognition-system

# 2. Create virtual environment
python -m venv .venv

# 3. Activate environment
.\.venv\Scripts\Activate.ps1

# 4. Upgrade pip
python -m pip install --upgrade pip

# 5. Install dependencies
pip install -r requirements.txt

# If requirements.txt is inside backend instead:
# pip install -r backend\requirements.txt

# 6. Enter backend
cd backend

# 7. Start server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open:

```text
http://localhost:8000
```

---

# Recommended First-Time Workflow

After starting the application:

```text
1. Open Dashboard
        ↓
2. Open Enroll Identity
        ↓
3. Enroll Person A
   - Use several images
        ↓
4. Enroll Person B
   - Use several images
        ↓
5. Open Recognize
        ↓
6. Test known faces
        ↓
7. Test an unknown person
        ↓
8. Open Evaluation Lab
        ↓
9. Run Evaluation
        ↓
10. Review FAR / FRR / similarity distributions
        ↓
11. Adjust threshold if required
        ↓
12. Test recognition again
```

---

# Important Notes

### The model is not trained by this project

Aperture uses a pretrained InsightFace model.

Enrollment stores face embeddings; it does not retrain the neural network.

### More enrollment images do not automatically guarantee better recognition

The quality and diversity of the images matter.

### Threshold changes affect recognition behavior

A threshold should preferably be selected using evaluation data rather than arbitrary experimentation.

### Evaluation requires enough identities and samples

A single enrolled identity cannot produce impostor comparisons.

### The application should be treated as an academic/local biometric system

It should not be considered a certified security or production biometric solution without additional security, privacy, anti-spoofing, and validation work.

---

# License and Model Notice

The application code and the pretrained InsightFace model have separate licensing considerations.

Before redistributing the project or using the pretrained models commercially, review the applicable licenses for:

* This project.
* InsightFace.
* The `buffalo_l` model package.
* ONNX Runtime.
* OpenCV.
* Other third-party dependencies.

The licensing terms of the pretrained face-recognition model should be checked independently before commercial deployment.

---

# Summary

Aperture provides a complete local face-recognition workflow:

```text
                 ┌──────────────────┐
                 │   Upload / Camera│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Face Detection   │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Quality Checks   │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ ArcFace Embedding│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ SQLite Gallery   │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Similarity Match │
                 └────────┬─────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
               Recognized     Unknown
```

The project combines:

* Multi-image enrollment.
* Webcam enrollment.
* Face quality validation.
* Local biometric storage.
* Face recognition.
* Unknown rejection.
* Configurable threshold.
* People management.
* Evaluation metrics.
* FAR/FRR analysis.
* A browser-based control interface.

For development, the primary command to start the application is:

```powershell
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open:

```text
http://localhost:8000
```
