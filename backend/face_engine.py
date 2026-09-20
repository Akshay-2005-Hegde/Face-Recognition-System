"""
face_engine.py
==============
Wraps InsightFace's `buffalo_l` model pack for:
  - Face detection (RetinaFace-based detector, bundled with buffalo_l)
  - 5-point landmark alignment (bundled)
  - Face embedding (ArcFace, 512-d, L2-normalized)

Design decisions (documented, not just implemented):

1. Model choice: InsightFace `buffalo_l` (ArcFace r100, trained on
   Glint360K/MS1MV3-derived data). Chosen over FaceNet / dlib's
   face_recognition / MediaPipe because:
     - It bundles detection + alignment + embedding in one pretrained,
       CPU-friendly pack (no separate training or dlib compilation).
     - ArcFace embeddings are widely benchmarked and consistently
       outperform older FaceNet/dlib embeddings on LFW/MegaFace-style
       verification tasks.
     - Fully open-source (non-commercial research license bundled
       models -- see README license notes), $0 cost, downloads once
       from GitHub release assets, then runs fully offline/local.
   Trade-off: heavier dependency footprint (onnxruntime) than a pure
   OpenCV Haar-cascade approach, but detection quality and embedding
   robustness are substantially better, which matters far more for
   correctness here than shaving a few MB off the install.

2. Quality gating happens HERE, not just in the API layer, so both
   /enroll and /recognize apply identical, centralized rules.

3. Embeddings returned by InsightFace are NOT guaranteed unit-norm
   from every version, so we explicitly L2-normalize before storing
   or comparing anything. This makes cosine similarity == dot product,
   which is what we use everywhere for speed and clarity.
"""

from dataclasses import dataclass
from typing import List, Optional
import numpy as np
import cv2

from insightface.app import FaceAnalysis

# ---- Tunable quality thresholds (documented, not hidden magic numbers) ----

MIN_DETECTION_SCORE = 0.55     # RetinaFace confidence floor
MIN_FACE_FRACTION = 0.06       # face bbox height must be >= 6% of image height
                                # (rejects "face is too small / too far away")
MAX_BLUR_REJECT_VARIANCE = 30  # Laplacian variance below this => reject as too blurry
DET_SIZE = (640, 640)          # detector input size


@dataclass
class DetectedFace:
    bbox: List[float]          # [x1, y1, x2, y2] in original image pixels
    det_score: float
    embedding: np.ndarray      # 512-d, L2-normalized float32
    landmark: Optional[np.ndarray]
    quality_ok: bool
    quality_reason: str        # "ok" or a human-readable rejection reason
    blur_score: float
    face_fraction: float       # bbox height / image height


class FaceEngine:
    """Thin, testable wrapper around InsightFace's FaceAnalysis app."""

    def __init__(self, model_name: str = "buffalo_l", ctx_id: int = 0):
        self.app = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=ctx_id, det_size=DET_SIZE)
        self.embedding_dim = 512
        self.model_name = model_name

    # ------------------------------------------------------------------
    def _blur_score(self, image_bgr: np.ndarray, bbox: List[float]) -> float:
        """Variance of Laplacian on the cropped face -- a standard, cheap
        sharpness proxy. Low variance ~= flat/blurry image."""
        h, w = image_bgr.shape[:2]
        x1, y1, x2, y2 = [int(max(0, v)) for v in bbox]
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return 0.0
        crop = cv2.cvtColor(image_bgr[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
        if crop.size == 0:
            return 0.0
        return float(cv2.Laplacian(crop, cv2.CV_64F).var())

    # ------------------------------------------------------------------
    def detect_and_embed(self, image_bgr: np.ndarray) -> List[DetectedFace]:
        """Run detection + alignment + embedding on a BGR image (as read
        by cv2.imread / cv2.imdecode). Returns one DetectedFace per
        detected face, each already quality-flagged."""
        h, w = image_bgr.shape[:2]
        raw_faces = self.app.get(image_bgr)

        results: List[DetectedFace] = []
        for f in raw_faces:
            bbox = [float(v) for v in f.bbox]
            emb = f.normed_embedding if hasattr(f, "normed_embedding") and f.normed_embedding is not None \
                else self._l2_normalize(f.embedding)
            emb = self._l2_normalize(np.asarray(emb, dtype=np.float32))

            face_h = max(1.0, bbox[3] - bbox[1])
            face_fraction = face_h / h
            blur = self._blur_score(image_bgr, bbox)

            reason = "ok"
            ok = True
            if float(f.det_score) < MIN_DETECTION_SCORE:
                ok, reason = False, f"low detection confidence ({f.det_score:.2f})"
            elif face_fraction < MIN_FACE_FRACTION:
                ok, reason = False, "face too small / too far from camera"
            elif blur < MAX_BLUR_REJECT_VARIANCE:
                ok, reason = False, "image too blurry"

            results.append(DetectedFace(
                bbox=bbox,
                det_score=float(f.det_score),
                embedding=emb,
                landmark=getattr(f, "kps", None),
                quality_ok=ok,
                quality_reason=reason,
                blur_score=blur,
                face_fraction=face_fraction,
            ))
        return results

    @staticmethod
    def _l2_normalize(v: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(v)
        if norm == 0:
            return v
        return v / norm

    # ------------------------------------------------------------------
    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Both vectors are assumed L2-normalized, so this is a dot product."""
        return float(np.dot(a, b))

    @staticmethod
    def centroid(embeddings: List[np.ndarray]) -> np.ndarray:
        """Average of L2-normalized embeddings, re-normalized. Provided as
        a secondary summary vector (used for fast dashboard-level stats);
        primary matching uses max-similarity across all samples -- see
        database.py / main.py docstrings for why."""
        stacked = np.stack(embeddings, axis=0)
        mean = stacked.mean(axis=0)
        return FaceEngine._l2_normalize(mean)


def decode_image(file_bytes: bytes) -> Optional[np.ndarray]:
    """Decode uploaded file bytes into a BGR OpenCV image, or None if
    the bytes are not a valid/decodable image."""
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def crop_thumbnail(image_bgr: np.ndarray, bbox: List[float], size: int = 112) -> bytes:
    """Crop+resize a small face thumbnail (JPEG bytes) for UI preview only.
    Deliberately small/low-res: enough to recognize the sample was captured
    correctly, not a usable high-res copy of the person's face. This is the
    privacy trade-off documented in the README (embeddings-first storage)."""
    h, w = image_bgr.shape[:2]
    x1, y1, x2, y2 = [int(max(0, v)) for v in bbox]
    x2, y2 = min(w, x2), min(h, y2)
    pad_x = int((x2 - x1) * 0.2)
    pad_y = int((y2 - y1) * 0.2)
    x1, y1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
    x2, y2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
    crop = image_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        crop = image_bgr
    crop = cv2.resize(crop, (size, size))
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return buf.tobytes() if ok else b""
