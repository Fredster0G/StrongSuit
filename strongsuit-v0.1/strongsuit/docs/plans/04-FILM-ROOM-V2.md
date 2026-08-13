# 04 — Film Room v2: occlusion, optional models, and velocity

---

## 1. The defect you named

> *"if someone is on a machine, their body is easily blocked. this can mess with the tracking"*

Correct, and it's the highest-value fix in this document. Machine work is a large share of what general-population clients actually do, and it's exactly where the current pipeline is weakest.

### 1.1 Why it fails today

The pipeline is `MediaPipe Lite → LandmarkSmoother (One-Euro) → FocusJointPicker → RepCounter`. S11 added real hardening (visibility-weighted blending, a ≥60% visibility gate on focus-joint selection, an occlusion hint). But three structural problems remain:

| # | Problem | Consequence on a leg press / lat pulldown / hack squat |
|---|---|---|
| 1 | **The smoother *holds*, it doesn't *predict*.** Below the confidence band it blends toward the last trusted position. | An occluded knee freezes mid-rep while the real knee keeps moving. Depth reads shallow. |
| 2 | **No skeletal constraints.** Each landmark is filtered independently. | The model can output an anatomically impossible limb (femur "shortens" behind a pad) and nothing rejects it. |
| 3 | **Metrics don't know they're guessing.** `depthPct`, `symmetryPct`, `repConsistency` consume smoothed values with no confidence attached. | A confidently wrong "68% depth" — worse than no number. |

Plus: `depthPct` uses *observed max angle* as the standing reference, which underreports when a machine never shows full extension (existing debt #10).

---

## 2. The fix, in four layers

### Layer 1 — Predict through occlusion (replace the smoother)

Swap One-Euro-per-landmark for a **constant-velocity state estimator per landmark** (a small Kalman filter, or an alpha-beta filter if we want to stay dependency-free):

- **State:** position + velocity. **Visible** → correct with the measurement. **Occluded** → *predict forward and inflate uncertainty.*
- A knee that disappears behind a pad mid-descent keeps descending at its established velocity instead of freezing.
- Uncertainty grows while occluded, so after ~0.4 s the app stops trusting it and says so, rather than extrapolating into fiction.

**Keep One-Euro for the visible case** — it's well-tuned and the existing tests assert its real behaviour. The Kalman layer sits on top for the occluded case.

### Layer 2 — Skeletal constraints ← the biggest single win

**A person's bone lengths do not change during a set.** That's a free, extremely strong prior nobody is using:

1. **Calibrate** limb lengths from high-confidence frames (median over frames where both endpoints have visibility > 0.8), normalised to torso length for scale invariance.
2. **Reject** any frame where a bone deviates >15% from its calibrated length — that's a detection error, not motion.
3. **Reconstruct** an occluded joint by inverse kinematics: if hip and ankle are visible and the knee isn't, the knee lies on the circle intersection defined by femur and tibia length. Disambiguate with the joint's prior velocity and anatomical limits.

**This directly solves the machine case.** On a leg press the hip and ankle are usually visible while the knee is behind the pad or the rail — exactly the solvable configuration. Add joint-angle limits (knee 0–160°, elbow 0–160°, no hyperextension beyond physiological range) as a second rejection filter.

### Layer 3 — Confidence-gated metrics

Every derived metric gains a confidence value, and the UI never shows a number it doesn't trust:

```ts
interface Measured<T> {
  value: T
  confidence: number        // 0–1
  basis: 'observed' | 'reconstructed' | 'predicted'
  occludedFrames: number
}
```

- `confidence > 0.8` → show normally
- `0.5–0.8` → show with a dotted underline; tooltip: *"knee was blocked for part of this rep"*
- `< 0.5` → **don't show the number.** Show *"couldn't measure depth — the knee was hidden for most of this rep."*

Reps are tagged `measured | partial | unmeasurable` and the per-rep table (shipped in S14) shows it. **A coach trusting a wrong number is worse than a coach seeing an honest gap.**

### Layer 4 — Equipment context presets

Let the user say what they're filming. One dropdown, big payoff:

| Preset | What it changes |
|---|---|
| **Free weight — barbell / dumbbell** | Current behaviour; bar path from wrists |
| **Leg press / hack squat** | Expect hip+knee occlusion; prefer ankle–hip reconstruction; reference angles from the machine's ROM, not observed max |
| **Lat pulldown / seated row** | Lower body static — exclude from focus-joint selection entirely; track elbow + shoulder only |
| **Smith machine** | Bar path is constrained to a line — use it as a calibration reference |
| **Cable / functional trainer** | Expect partial torso occlusion from the stack |
| **Treadmill / bike / rower** | Cyclic gait mode, cadence not reps |
| **Bench (flat/incline)** | Torso partly occluded by the bench; hip reference fixed |

The preset also **fixes debt #10**: instead of inferring "standing" from observed max angle, each preset supplies a sane reference ROM.

Auto-suggest the preset from the linked exercise's `equipment` tags — the library already has them, and the curated base-pattern mapping in [05](05-EXERCISE-LIBRARY.md) makes it reliable.

---

## 3. Optional model tiers

Per your instruction — more models, user-selected, with light versions. Wired into the model manager ([02](02-LOCAL-AI.md) §4).

| Tier | Model | Size | Needs | Best for |
|---|---|---|---|---|
| **Light** *(default)* | MediaPipe Pose Lite | 5.7 MB | CPU | Any laptop. Current behaviour. |
| **Standard** | MediaPipe Pose Full | ~9 MB | CPU/GPU | Noticeably better under partial occlusion |
| **Heavy** | MediaPipe Pose Heavy | ~29 MB | GPU | Best MediaPipe accuracy |
| **Pro** | RTMPose-m (ONNX) | ~50 MB | GPU | Best-in-class occlusion robustness |
| **Add-on** | Plate/barbell detector (small YOLO-class, **permissively licensed only**) | ~10 MB | GPU | True bar path + real-world scale — §4 |

⚠️ **Licence trap:** Ultralytics YOLOv8/v11-pose is **AGPL-3.0** and would force open-sourcing the entire app. Not usable. RTMPose (Apache-2.0) is the correct Pro choice. Any detector we add must be verified permissive before a line of integration code.

The picker shows measured FPS on *this* machine, not vendor claims:
```
  Movement tracking quality

  ○ Light      5.7 MB   ~60 fps on your hardware      Installed
  ◉ Standard   9 MB     ~45 fps                       Installed
  ○ Heavy      29 MB    ~22 fps                       Download
  ○ Pro        50 MB    ~30 fps (GPU)   Best when equipment blocks the body
```

---

## 4. New analyses (each independently optional)

### 4.1 Velocity-Based Training ← **the flagship addition**

Mean concentric velocity per rep, from video. Dedicated VBT hardware (GymAware, Vitruve) costs **$300–500**; doing it from a phone is a genuine differentiator.

- **Scale reference:** a standard bumper plate is **450 mm** diameter, an Olympic bar **2,200 mm**. Detect either and pixel→metre calibration is solved.
- **Outputs:** mean concentric velocity, peak velocity, **velocity loss across a set** (the best-validated autoregulation signal), and an estimated load–velocity profile over time.
- **Why it matters:** velocity loss thresholds (~10–20%) are the strongest evidence-based method for autoregulating volume. Sources: Jovanović & Flanagan 2014; **Weakley et al. 2021** (velocity-based training review); Pareja-Blanco et al. 2017 (velocity loss and adaptation).
- **Honesty requirement:** video VBT is less accurate than a linear position transducer. Report a confidence band and say so plainly. Never claim parity with a $500 device.

This feeds straight into `lib/progression.ts` — velocity loss becomes a first-class progression input alongside RPE.

### 4.2 The rest

| Analysis | Value | Notes |
|---|---|---|
| **Auto set/rep segmentation** | Removes manual scrubbing — find every set in a long clip | Extends existing RepCounter |
| **Knee valgus / varus tracking** | Frontal-plane knee deviation, a real screening signal | Needs front-facing view; state the requirement |
| **Spinal angle & lumbar flexion** | Hinge coaching | Sagittal view only |
| **Range-of-motion consistency** | Already partly there via depth CV — surface as ROM per rep | |
| **Tempo prescription compliance** | Prescribed 3-1-1 vs actual | Ties Film Room to the program |
| **Centre-of-mass / balance proxy** | Unilateral and rehab work | Lower confidence — label it |
| **Multi-person mode** | Group/class filming (Studio edition) | Heavier; Studio-tier feature |
| **Side-by-side over time** | Same lift, this month vs. six months ago | Strong client-retention feature; needs stored clips — **opt-in, local-only** |

---

## 5. UX changes

1. **Occlusion is shown, not hidden.** Reconstructed segments render dashed; predicted ones dotted and fading. The coach can *see* what's inferred. This is the honest version and it builds trust.
2. **A confidence strip under the scrubber** — a per-frame band (green/amber/red) so you can see at a glance which part of a set was clean.
3. **"Reframe" coaching card** — when tracking quality is poor, say *why* and *what to change*: *"The rack upright is blocking the left hip. Move the camera ~1 m left, or film from the other side."* Actionable, not just an error.
4. **A 10-second setup check** before recording: framing, lighting, full-body-in-frame, camera stability. Catches bad footage before the set instead of after.
5. **Preset-aware empty states** — leg press mode tells the user which joints it will and won't be able to measure, up front.

---

## 6. Build order

| Step | Work | Risk |
|---|---|---|
| 1 | `Measured<T>` confidence type; thread through every metric; UI gating | Low — pure additive |
| 2 | Bone-length calibration + constraint rejection | Medium — needs real footage to tune the 15% threshold |
| 3 | Kalman/alpha-beta predict-through-occlusion | Medium |
| 4 | IK reconstruction for the single-occluded-joint case | Medium-high — the leg-press win |
| 5 | Equipment presets + reference ROM (closes debt #10) | Low |
| 6 | Model tier manager + Standard/Heavy/Pro downloads | Low |
| 7 | Plate detection → scale → VBT | High — the flagship, do it properly or not at all |
| 8 | Remaining analyses, individually gated | Medium |

**Testing requirement, stated plainly:** none of this can be validated on synthetic footage. It needs a real recorded set on a leg press, a lat pulldown, and a squat rack — including deliberately bad framing. That's the same real-hardware gap as debt #7/#10/#61, and it should be gathered *before* step 2, because every threshold in steps 2–4 is tuned against it.
