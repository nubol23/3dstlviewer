# Lighting rewrite verification

Verified on 2026-10-01. One branch and one PR; four implementation commit groups.

## Reference scenes

- **military bust 3d model.stl**: 1,968,612 triangles.
- **Fantasy_Archer_32mm_tabletop.stl**: 1,965,419 triangles.

Both files were read in place, never copied into the repository, committed, or
added to tests/fixtures. No decimation. The only committed STL geometry remains
the three original small fixtures. Normals change shading, not vertex positions.

## Exact rendering dependencies

| Dependency | Version |
| --- | --- |
| three | 0.186.1 |
| @react-three/fiber | 9.8.1 |
| @react-three/drei | 10.7.9 |
| postprocessing | 6.39.5 |
| n8ao | 2.0.1 |
| three-gpu-pathtracer | 0.0.26 |
| three-mesh-bvh | 0.9.15 |
| xatlas-web, peer | 0.1.0 |
| React / React DOM | 19.2.7 |
| pngjs / @types/pngjs, test-only | 7.0.0 / 6.0.5 |

Drei also retains its own compatible three-mesh-bvh 0.8.3 transitively. The
pathtracer uses 0.9.15. Three.js is shared. No force/legacy-peer-deps install flags.
The optional-transitive lock inconsistency discovered during verification was
repaired and folded into the dependency commit. A fresh npm ci succeeded.

## Backend and quality

The full bust passed the WebGLPathTracer spike in the raster renderer's existing
context. WebGL refinement shipped; no WebGPU fallback or partial backend is
included. The upstream WebGL class is deprecated, so its version is pinned; a
future upgrade requires another backend check. The same MeshPhysicalMaterial uses roughness 1, metalness 0 and
specularIntensity 0 in both tiers. The same gradient environment feeds both.
AgX is fixed before perceptual value extraction. The denoise pass uses an orthographic camera whose near plane includes its
fullscreen triangle, with a pixel-based regression guarding that integration.
Library denoising precedes AgX
for refinement; library SMAA follows the value effect for both tiers.

Raster budgets: desktop primary/secondary shadow maps 2048/1024 with 16 PCSS
samples; mobile 1024/512 with 8 samples. AO is half-resolution Medium/Low, SMAA
Medium/Low. DPR caps are 1.5/1. Refinement is lazy, hardware-feature-detected,
desktop only, three path bounces, longest edge capped at 960 pixels, and 64
samples or five seconds after the first sample, whichever comes first.

Broad zenithal's initial environment contribution was visually too flat. Its
final default is spread 0.4 with restrained environment strength 0.15. Default
band thresholds span the useful AgX midtone region; all thresholds remain
adjustable. There is no auto-exposure or selectable tone curve.

## Measurements

Hardware: Intel Core i5-11400, 32 GiB RAM, NVIDIA RTX 3070 Ti, Linux X11,
Google Chrome 153.0.8010.52 with hardware ANGLE/OpenGL. Production GitHub Pages
build served at its /3dstlviewer/ base path. Each final measurement used a fresh
browser session. Desktop viewport 1440x1000, DPR 1. Mobile emulation used
390x844, touch, DPR 1, and a requested 4x CPU slowdown; its canvas was 368x440.
The GPU and worker CPU remained desktop hardware, so this is **not a physical
phone benchmark**.

| Model | Tier | Load | Normals | Scene/BVH | First sample after prep | Sampling | Orbit frame median / p95 | Observed browser RSS peak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bust | Desktop | 2.70 s | 0.74 s | 10.91 s | 7.39 s | 5.01 s | 16.7 / 16.7 ms | 4.87 GiB |
| Archer | Desktop | 2.73 s | 0.75 s | 11.11 s | 6.94 s | 5.02 s | 16.7 / 16.8 ms | 5.06 GiB |
| Bust | Mobile emulation | 6.44 s | 0.77 s | n/a | n/a | n/a | 16.7 / 16.8 ms | 1.81 GiB |
| Archer | Mobile emulation | 6.48 s | 0.76 s | n/a | n/a | n/a | 16.7 / 16.7 ms | 1.80 GiB |

Mobile refinement columns are not applicable: refinement was
absent and its bundle/worker was not fetched. Desktop runs reached 33 samples for the bust and 30 for the archer in the five-second sampling budget.
First-sample time includes shader
compilation and startup; it is separate from the sampling limit. Scene/BVH time
includes library geometry extraction, BVH generation and GPU upload, not only
worker construction.

Frame numbers are requestAnimationFrame intervals during 90 orbit input moves,
not isolated GPU draw timings or a promised FPS. Desktop CPU submission medians
were 0.4 ms for the bust and 0.5 ms for the archer. Mobile-emulated CPU submission
medians were 2.3 ms and 1.6 ms. RSS is the observed sum across browser processes,
with shared pages potentially counted more than once; it is not GPU VRAM.
Browser-reported heap after desktop refinement was about 2.25 GB for each model.

Both full models loaded in mobile emulation. No load failure occurred through
1,968,612 triangles in this test. **A physical mobile failure threshold remains
unmeasured**, because no physical mobile device was attached. No lower triangle
count or silent simplification is substituted for that missing measurement.

## Checks and evidence

- npm ci --no-audit --no-fund: passed from the repaired lockfile.
- npm run lint: passed, zero lint warnings.
- npm test: 72 passed across 8 files.
- npm run build -- --mode github-pages: passed. Vite reports a large initial
  chunk warning; the initial JS is about 1.70 MB / 539 KB gzip, with refinement
  in a separate roughly 208 KB / 60 KB gzip chunk plus its worker.
- Eight hardware-GPU Playwright tests passed against the static Pages build.
  They cover import/orientation, mobile layout, stepped controls, independent
  lighting, distance changes, adjacent thresholds, persistence, refinement
  lifecycle and color/grayscale comparison. A pixel-based refinement regression
  proves traced occlusion reaches the displayed image; it fails with the old
  clipped denoiser camera and passes with the corrected fullscreen camera.
  Optional favicon requests are routed
  only in tests, without unrelated production changes.
- Both independent contract-scope and KISS reviews passed after fixing effective
  reflector BVH invalidation, floating-point threshold bounds, responsive
  shadow-budget invalidation, and the denoiser camera integration. Retired helper
  code was removed.

The local evidence bundle contains 36 full-size bust stills: six presets in
continuous and stepped modes, with original, raster and refined images. Original
local/dual/reflected presets did not exist, so their before images use the old
directional baseline and are labeled accordingly. Viewport framing was matched
without changing the original lighting. Two comparison galleries, full miniature
and mobile stills, a 12.8-second orbit/control recording and raw metrics accompany
the report. Render outputs and source models are not committed.

## Remaining approximations and limits

- Raster environment and ground fill are approximate; screen-space AO cannot see
  hidden/offscreen occluders or calculate true interreflection. Refinement traces
  visibility and floor/reflector contribution.
- One global PCSS size affects all raster direct sources. Finite source radius is
  honored by the local spotlight in refinement. Directional sources remain
  infinitely distant and have hard traced shadows; raster PCSS is an artistic
  approximation and can differ from refinement.
- Raster floor cast shadows are disabled. Model self-shadowing remains. Traced
  ground visibility remains physical because it affects reflected light.
- Ground Reflectance scales the chosen floor color/albedo and the gradient's
  lower-hemisphere approximation. It is not a separate light source.
- Three bounces and finite sampling can retain noise or omit higher-order energy.
  Library denoising can soften fine detail. Shader startup and scene extraction
  are outside the five-second sampling limit; cancellation cannot preempt an
  individual synchronous library/driver operation.
- Smoothing deliberately simplifies small screen-space value regions. SMAA adds
  intermediate edge pixels; band interiors use the selected palette.
- Colored value mapping moves toward white/black to maintain the chosen
  perceptual value without RGB clipping. It is artistic display processing.
- Crease-aware normal grouping uses a 60-degree threshold and position hashing
  at approximately 1e-5 of model extent. Geometry is not decimated or displaced.
- Distances are model-relative. Literal spray deposition, metallic/specular
  material studies, WebGPU refinement and physical-mobile performance validation
  are not included.

## Rollout

The PR is not merged or deployed. Merging to main triggers the existing static
GitHub Pages workflow. Persisted schema version 6 discards older settings and
presets without migration or notice. Reverting the PR restores the prior code;
previous local settings discarded by the new schema cannot be recovered by code
rollback alone.
