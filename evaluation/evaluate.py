"""
evaluate.py
============
Evaluates the LIVE database. It pulls all currently enrolled identities from
the SQLite database, calculates the exact True/False Accept rates across every 
single possible pair of images, and computes similarity distributions.
"""

import argparse
import json
import sys
import time
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
import database as db

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold-grid", type=int, default=201) # -1.0 to 1.0 step 0.01
    ap.add_argument("--write-to-db", action="store_true")
    args = ap.parse_args()

    print("Fetching live database embeddings...")
    all_identities = {}
    
    db.init_db()
    for item in db.all_embeddings():
        name = item["name"]
        if name not in all_identities:
            all_identities[name] = []
        all_identities[name].append(item["vector"])

    # FIX: If database is empty, save an "insufficient_data" state so the UI clears old charts
    if not all_identities:
        print("\nNo enrollment data found in database.")
        report = {
            "status": "insufficient_data",
            "message": "The live database is empty. Enroll at least two people with multiple images to generate telemetry."
        }
        _save(report, args)
        sys.exit(0) # Exit 0 (Success) so the FastAPI backend doesn't throw a 500 error

    print(f"\nFound {len(all_identities)} unique identities.")

    genuine_sims = []
    all_embs_list = []
    labels = []
    
    for label, embs in all_identities.items():
        if len(embs) > 1:
            for i in range(len(embs)):
                for j in range(i+1, len(embs)):
                    genuine_sims.append(np.dot(embs[i], embs[j]))
        for e in embs:
            all_embs_list.append(e)
            labels.append(label)

    impostor_sims = []
    if len(all_embs_list) > 1:
        X = np.stack(all_embs_list)
        sim_matrix = np.dot(X, X.T)
        
        for i in range(len(labels)):
            for j in range(i+1, len(labels)):
                if labels[i] != labels[j]:
                    impostor_sims.append(sim_matrix[i, j])

    n_genuine = len(genuine_sims)
    n_impostor = len(impostor_sims)
    print(f"Calculated {n_genuine} genuine pairs and {n_impostor} impostor pairs.")

    report = {
        "generated_at": time.time(),
        "n_genuine": n_genuine,
        "n_impostor": n_impostor,
        "identities_enrolled": list(all_identities.keys()),
    }

    if n_genuine == 0 or n_impostor == 0:
        report["status"] = "insufficient_data"
        report["message"] = ("Not enough data for full evaluation. To evaluate, you need at least "
                             "two people enrolled, and at least one person needs multiple images.")
        print("\n" + report["message"])
        _save(report, args)
        return

    genuine_arr = np.array(genuine_sims)
    impostor_arr = np.array(impostor_sims)
    grid = np.linspace(-1.0, 1.0, args.threshold_grid)

    # 1. FAR / FRR Curve Calculation
    best_t, best_gap = None, None
    curve = []
    for t in grid:
        far = float((impostor_arr >= t).mean())
        frr = float((genuine_arr < t).mean())
        if -0.2 <= t <= 1.0:
            curve.append({"threshold": round(float(t), 2), "far": far, "frr": frr})
            
        gap = abs(far - frr)
        if best_gap is None or gap < best_gap:
            best_gap, best_t = gap, float(t)

    threshold = round(best_t, 4)
    far = float((impostor_arr >= threshold).mean())
    frr = float((genuine_arr < threshold).mean())

    tp = int((genuine_arr >= threshold).sum())
    fn = int((genuine_arr < threshold).sum())
    fp = int((impostor_arr >= threshold).sum())
    tn = int((impostor_arr < threshold).sum())

    accuracy = (tp + tn) / (tp + tn + fp + fn)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    # 2. Histogram Distribution Calculation (For visualization)
    gen_hist, gen_bins = np.histogram(genuine_arr, bins=40, range=(-0.2, 1.0))
    imp_hist, imp_bins = np.histogram(impostor_arr, bins=40, range=(-0.2, 1.0))
    
    distribution_data = {
        "labels": [round(float(b), 2) for b in gen_bins[:-1]],
        "genuine": [int(c) for c in gen_hist],
        "impostor": [int(c) for c in imp_hist]
    }

    report.update({
        "status": "ok",
        "threshold": threshold,
        "far": far,
        "frr": frr,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "genuine_mean": float(genuine_arr.mean()),
        "genuine_std": float(genuine_arr.std()),
        "impostor_mean": float(impostor_arr.mean()),
        "impostor_std": float(impostor_arr.std()),
        "confusion": {"tp": tp, "fn": fn, "fp": fp, "tn": tn},
        "curve": curve,
        "distribution": distribution_data 
    })

    print("\n===== EVALUATION REPORT =====")
    print(f"Identities evaluated: {len(all_identities)}")
    print(f"Genuine pairs       : {n_genuine}  (mean sim {genuine_arr.mean():.4f})")
    print(f"Impostor pairs      : {n_impostor}  (mean sim {impostor_arr.mean():.4f})")
    print(f"Optimal threshold   : {threshold}  (EER point)")
    print(f"FAR @ threshold     : {far:.4f}")
    print(f"FRR @ threshold     : {frr:.4f}")
    print(f"Accuracy            : {accuracy:.4f}")
    print("==============================")

    _save(report, args)


def _save(report, args):
    out_path = Path(__file__).parent / "report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
        
    if args.write_to_db:
        db.init_db()
        db.set_config("last_evaluation_report", report)
        
        # Only override the active match threshold if evaluation was fully successful
        if report.get("status") == "ok" and "threshold" in report:
            db.set_config("match_threshold", report["threshold"])
            print("Wrote report + updated match_threshold in backend database.")
        else:
            print("Wrote empty/insufficient state to backend database.")

if __name__ == "__main__":
    main()