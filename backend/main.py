# backend/main.py
"""
main.py
========
FastAPI backend for the Face Recognition Identification System.
"""

import time
import logging
import subprocess
import sys
import uuid
from pathlib import Path
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles

import database as db
from face_engine import FaceEngine, decode_image, crop_thumbnail

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-recognition")

DEFAULT_THRESHOLD = 0.38
MAX_ENROLL_IMAGES = 10
MIN_ENROLL_IMAGES = 1

app = FastAPI(title="Face Recognition Identification System", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine: Optional[FaceEngine] = None


@app.on_event("startup")
def startup():
    global engine
    db.init_db()
    logger.info("Loading face model (InsightFace buffalo_l)... this can take a few seconds.")
    engine = FaceEngine(model_name="buffalo_l")
    if db.get_config("match_threshold") is None:
        db.set_config("match_threshold", DEFAULT_THRESHOLD)
    logger.info("Startup complete.")


def get_threshold() -> float:
    return float(db.get_config("match_threshold", DEFAULT_THRESHOLD))


def bbox_to_dict(bbox: List[float]) -> dict:
    return {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]}


# --------------------------------------------------------------- health ---

@app.get("/health")
def health():
    return {
        "status": "ok" if engine is not None else "model_not_loaded",
        "model": engine.model_name if engine else None,
        "embedding_dim": engine.embedding_dim if engine else None,
        "people_enrolled": db.count_people(),
        "total_samples": db.count_samples(),
        "match_threshold": get_threshold(),
    }


@app.get("/dashboard")
def dashboard():
    stats = db.recognition_stats()
    return {
        "total_people": db.count_people(),
        "total_samples": db.count_samples(),
        **stats,
        "match_threshold": get_threshold(),
    }


# -------------------------------------------------------------- enroll ---

@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    external_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
):
    name = name.strip()
    if not name:
        raise HTTPException(400, "Name is required.")
        
    # Auto-generate ID if none is provided by the frontend
    if not external_id:
        external_id = f"UID-{uuid.uuid4().hex[:6].upper()}"
        
    existing = db.get_person_by_name(name)
    if existing:
        raise HTTPException(409, f"A person named '{name}' is already enrolled. Please use a unique name.")

    if len(files) < MIN_ENROLL_IMAGES:
        raise HTTPException(400, f"At least {MIN_ENROLL_IMAGES} image is required.")
    if len(files) > MAX_ENROLL_IMAGES:
        raise HTTPException(400, f"Maximum {MAX_ENROLL_IMAGES} images per enrollment.")

    per_image_results = []
    accepted = []

    for f in files:
        raw = await f.read()
        img = decode_image(raw)
        if img is None:
            per_image_results.append({"filename": f.filename, "accepted": False,
                                       "reason": "Not a valid/decodable image file."})
            continue

        faces = engine.detect_and_embed(img)
        if len(faces) == 0:
            per_image_results.append({"filename": f.filename, "accepted": False,
                                       "reason": "No face detected."})
            continue
        if len(faces) > 1:
            per_image_results.append({"filename": f.filename, "accepted": False,
                                       "reason": f"{len(faces)} faces detected; enrollment requires exactly one face per image."})
            continue

        face = faces[0]
        if not face.quality_ok:
            per_image_results.append({"filename": f.filename, "accepted": False,
                                       "reason": f"Rejected: {face.quality_reason}."})
            continue

        thumb = crop_thumbnail(img, face.bbox)
        accepted.append((face.embedding, thumb))
        per_image_results.append({
            "filename": f.filename, "accepted": True,
            "det_score": round(face.det_score, 3),
            "face_fraction": round(face.face_fraction, 3),
            "blur_score": round(face.blur_score, 1),
        })

    if len(accepted) == 0:
        raise HTTPException(
            422,
            detail={"message": "No enrollment images passed quality checks.",
                    "per_image_results": per_image_results},
        )

    gallery = db.all_embeddings()
    rec_threshold = get_threshold()
    dedup_threshold = max(0.15, rec_threshold - 0.10) 
    
    if gallery:
        for emb, _ in accepted:
            for item in gallery:
                sim = FaceEngine.cosine_similarity(emb, item["vector"])

                if sim >= dedup_threshold:
                    logger.warning(f"BLOCKED DUPLICATE: Attempted to enroll '{name}', but face matched '{item['name']}' with similarity {sim:.3f}")
                    
                    for res in per_image_results:
                        if res.get("accepted"):
                            res["accepted"] = False
                            res["reason"] = f"Duplicate of '{item['name']}' (Score: {sim:.2f})"

                    raise HTTPException(
                        status_code=409,
                        detail={
                            "message": f"Biometric Conflict: This face looks too similar to '{item['name']}' (Score: {sim:.2f}).",
                            "per_image_results": per_image_results
                        }
                    )

    person_id = db.create_person(name, external_id)
    for emb, thumb in accepted:
        db.add_embedding(person_id, emb)
        db.add_thumbnail(person_id, thumb)

    return {
        "person_id": person_id,
        "name": name,
        "external_id": external_id,
        "accepted_samples": len(accepted),
        "rejected_samples": len(files) - len(accepted),
        "per_image_results": per_image_results,
    }


# ------------------------------------------------------------ recognize ---

@app.post("/recognize")
async def recognize(file: UploadFile = File(...)):
    raw = await file.read()
    img = decode_image(raw)
    if img is None:
        raise HTTPException(400, "Not a valid/decodable image file.")

    t0 = time.time()
    faces = engine.detect_and_embed(img)
    detect_ms = (time.time() - t0) * 1000

    if len(faces) == 0:
        return {"faces": [], "message": "No face detected in the image.", "timing_ms": {"detect_and_embed": round(detect_ms, 1)}}

    gallery = db.all_embeddings()
    threshold = get_threshold()

    t1 = time.time()
    results = []
    for face in faces:
        entry = {
            "bbox": bbox_to_dict(face.bbox),
            "det_score": round(face.det_score, 3),
            "quality_ok": face.quality_ok,
            "quality_reason": face.quality_reason,
        }
        if not face.quality_ok:
            entry.update({"name": None, "status": "rejected", "similarity": None,
                          "person_id": None,
                          "reason": f"Face skipped: {face.quality_reason}."})
            results.append(entry)
            continue

        if not gallery:
            entry.update({"name": "Unknown", "status": "unknown", "similarity": 0.0,
                          "person_id": None, "reason": "Enrollment database is empty."})
            db.log_recognition(None, 0.0, False)
            results.append(entry)
            continue

        best_person_id, best_name, best_sim = None, None, -1.0
        for item in gallery:
            sim = FaceEngine.cosine_similarity(face.embedding, item["vector"])
            if sim > best_sim:
                best_sim, best_person_id, best_name = sim, item["person_id"], item["name"]

        is_known = best_sim >= threshold
        db.log_recognition(best_person_id if is_known else None, best_sim, is_known)
        entry.update({
            "name": best_name if is_known else "Unknown",
            "status": "recognized" if is_known else "unknown",
            "similarity": round(best_sim, 4),
            "person_id": best_person_id if is_known else None,
            "threshold_used": threshold,
        })
        results.append(entry)

    match_ms = (time.time() - t1) * 1000
    return {
        "faces": results,
        "num_faces_detected": len(faces),
        "timing_ms": {
            "detect_and_embed": round(detect_ms, 1),
            "matching": round(match_ms, 2),
        },
    }


# --------------------------------------------------------------- people ---

@app.get("/people")
def get_people():
    return db.list_people()


@app.get("/people/{person_id}")
def get_person(person_id: int):
    person = db.get_person(person_id)
    if not person:
        raise HTTPException(404, "Person not found.")
    return person


@app.get("/people/{person_id}/thumbnail/{thumb_id}")
def get_thumbnail(person_id: int, thumb_id: int):
    jpeg = db.get_thumbnail(thumb_id)
    if jpeg is None:
        raise HTTPException(404, "Thumbnail not found.")
    return Response(content=jpeg, media_type="image/jpeg")


@app.delete("/people/{person_id}")
def delete_person(person_id: int):
    ok = db.delete_person(person_id)
    if not ok:
        raise HTTPException(404, "Person not found.")
    return {"deleted": True, "person_id": person_id}


# ------------------------------------------------------------ evaluation --

@app.get("/evaluation")
def get_evaluation():
    report = db.get_config("last_evaluation_report")
    if report is None:
        return JSONResponse({
            "available": False,
            "message": "No evaluation has been run yet. Enroll people and click Run Evaluation below.",
            "current_threshold": get_threshold(),
        })
    return {"available": True, "current_threshold": get_threshold(), **report}


@app.post("/evaluation/threshold")
def set_threshold(value: float):
    if not (-1.0 <= value <= 1.0):
        raise HTTPException(400, "Cosine similarity threshold must be between -1 and 1.")
    db.set_config("match_threshold", value)
    return {"match_threshold": value}


# Explicitly defined as accepting NO arguments/body to prevent 422 errors
@app.post("/evaluation/run")
def run_evaluation_endpoint():
    script_path = Path(__file__).parent.parent / "evaluation" / "evaluate.py"
    
    cmd = [sys.executable, str(script_path), "--write-to-db"]
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise HTTPException(500, detail=f"Script failed:\n{result.stdout}\n{result.stderr}")
        return {"message": "Success", "log": result.stdout}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")