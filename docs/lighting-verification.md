# Lighting rewrite verification

Verified on 2026-10-01. One branch and one PR; four implementation commit groups plus the approved contrast correction.

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

All six presets now use a stronger key/fill hierarchy and a shared Contrast
control, default 2.2 (1 is neutral, maximum 3). Broad zenithal uses spread 0.35
and environment strength 0.18. Manual exposure stays at 1; no auto-exposure or
selectable tone curve. Default band thresholds are equally spaced after contrast
shaping, giving five-band studies two shadow values below the midpoint.
Smoothing defaults to 0.5 pixels. The library denoiser uses sigma 1.5, kSigma 1
and threshold 0.12; sampling and resolution budgets are unchanged.

## Initial rewrite measurements

These measurements precede the contrast correction. Geometry preparation, BVH,
resolution and sampling budgets remain unchanged; they are not presented as a
new benchmark of the adjusted defaults.

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
- npm test: 73 passed across 8 files.
- npm run build -- --mode github-pages: passed. Vite reports a large initial
  chunk warning; the initial JS is about 1.70 MB / 539 KB gzip, with refinement
  in a separate roughly 208 KB / 60 KB gzip chunk plus its worker.
- Nine hardware-GPU Playwright tests passed against the static Pages build.
  They cover import/orientation, mobile layout, stepped controls, independent
  lighting, distance changes, adjacent thresholds, persistence, refinement
  lifecycle and color/grayscale comparison. A pixel-based refinement regression
  proves traced occlusion reaches the displayed image; it fails with the old
  clipped denoiser camera and passes with the corrected fullscreen camera.
  The contrast regression renders the existing small fixture with a nearby
  studio source and checks increased separation plus retained dark gradations.
  Persistence and retaining refinement during contrast edits are also covered.
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

## Contrast correction verification

The follow-up capture set contains all six bust presets in continuous and
stepped modes, both raster and refined. The full archer was checked in all six
raster setups and in strict/broad zenithal and directional refinement, also in
both value modes. A separate comparison viewer pairs the previous rewrite
defaults with the revised defaults; original pre-rewrite evidence is retained.

The comparison keeps the camera, model, background and AgX curve fixed. Raster
directional light/shadow separation now comes from a stronger key/fill hierarchy
and the bounded lightness curve. The curve preserves endpoints and midpoint and
has positive slope throughout the supported range; it cannot create a flat
black plateau in continuous mode. User-adjusted Band Bias can still intentionally
clip values, and stepped mode deliberately collapses values into selected bands.

Fixed rectangles on the 818×913 directional bust image quantify the change:
lit cheek (350,295)–(383,329), shadow cheek (460,325)–(488,366), and shadowed neck
(378,418)–(438,465). Values below are displayed 8-bit sRGB grayscale, not linear
radiance or physical reflectance. Percentiles use 4×4 block averages to reduce
the contribution of fine sampling noise.

| Measurement | Previous raster | Revised raster | Previous refinement | Revised refinement |
| --- | --- | --- | --- | --- |
| Lit cheek mean minus shadow cheek mean | 87.6 | 142.5 | 73.7 | 123.5 |
| Shadow cheek p10–p90 | 70.1–86.9 | 51.9–78.0 | 76.8–91.9 | 66.0–91.6 |
| Shadowed neck p10–p90 | 56.0–72.2 | 41.2–53.8 | 70.9–76.2 | 68.9–91.1 |

This demonstrates stronger separation while retaining broad tonal variation in
the sampled shadows. It is an image comparison on these views, not a promise
that every sculpt or light placement has the same histogram. The painted
references guide the value hierarchy; the app still uses a uniform matte surface
and does not reproduce painted textures or metallic highlights.

The revised archer loaded in 2.99 s, including 0.75 s normal preparation. Scene
extraction/BVH/upload took 11.54 s. With the browser already warm, the first
sample followed 0.85 s later; subsequent lighting-only refinements started in
about 16 ms. Each sampling interval lasted 5.01–5.02 s and reached 30–33 samples.
A 90-move orbit gave 16.7/16.7 ms median/p95 animation-frame cadence and 0.5 ms
median CPU submission. These are a warm-session follow-up, not a replacement for
the fresh-session memory and startup measurements above. Bust captures reached
30–33 samples under the same limit. A current orbit/control recording accompanies
the comparisons.

Current mobile emulation also loaded both meshes without decimation: bust load
8.98 s / normals 1.20 s, archer load 6.37 s / normals 0.78 s. Both gave 16.7/16.7 ms
median/p95 touch-orbit cadence; CPU submission medians were 3.4/1.8 ms. The
Contrast slider worked in the View sheet, and neither the refinement button nor
its bundle was present. This run uses the same 390×844, DPR 1, requested 4× CPU
slowdown setup; timings vary with host load and are not physical-device results.

The contrast follow-up passed independent contract-scope and KISS reviews.
Six production files are needed to connect the single serialized control,
calibrate presets and the existing filter, and update the persistence schema;
there is no additional rendering framework, dependency, or migration path.

## Overcast interpretation and optional cool fill

The broad-zenithal follow-up compared its current defaults, Contrast 3, and
Spread 1 in raster/refinement on the full bust. The softer value separation is
consistent with illumination from a large sky. Raising contrast to 3 gives a
more graphic study, but does not correct environment visibility. Refinement
adds cavity and overhang shading that the raster environment/AO approximation
cannot fully reproduce. The preset and shared contrast default remain unchanged.

The [CIE overcast definition](https://cie.co.at/eilvterm/17-29-111) describes a
sky distribution. [CIBSE's daylight simulation reference, slide 38](https://www.cibse.org/media/rp5huvmb/fundamentals-of-light-and-daylight-simulation-software.pdf)
explains that it has no direct sun and the zenith is three times as bright as
the horizon. Our default gradient has a 2.92:1 zenith/horizon radiance ratio,
using the installed package's exponent-2 gradient and default ground color.
That endpoint ratio is similar; it does not make the complete distribution or
light transport a calibrated CIE simulation. Broad's default Spread 0.35 still
retains 65% of the overhead direct-source intensity. Spread 1 removes that
source for an environment-only study, with approximate ground fill in raster.
A single uniform matte model also lacks the painted value patterns in the
photographic references.

The primary dome remains adjustable in directional, local, dual and reflected
modes. The second direct source retains its own azimuth/elevation sliders.
Zenithal modes are deliberately fixed overhead. A lighting setup establishes
starting values; it does not lock later direction edits.

Dual and reflected modes now expose Cool Blue Fill and Monochrome actions in
both desktop and mobile lighting controls. The palette sets the second light to
#A8C7EF, environment to #B6C9E3 and floor to #78899F, and turns grayscale off.
These subdued blues separate the fill visually from a neutral or warm key.
The key color, directions, intensities, ground reflectance and exposure stay as
chosen. Monochrome changes only the comparison view, preserving the colors.
Manual colors and existing preset persistence remain available. No new stored
field, version reset, renderer or dependency is needed.

The full bust was inspected in both colored and monochrome output, continuous
and stepped, in raster and refinement for both setups: 16 current stills.
Value/color comparisons retained the completed refinement. The existing color
browser test now covers the shortcut, key/direction preservation, dome keyboard
input, monochrome comparison, reload and mobile reflected-mode controls. All
73 unit tests and 9 hardware-GPU browser tests passed again, along with lint and
the Pages build. Both independent scope reviews passed; only AppShell changes
in production for this follow-up.

## Remaining approximations and limits

- Raster environment and ground fill are approximate; screen-space AO cannot see
  hidden/offscreen occluders or calculate true interreflection. Refinement traces
  visibility and floor/reflector contribution.
- One global PCSS size affects all raster direct sources. Finite source radius is
  honored by the local spotlight in refinement. Directional sources remain
  infinitely distant and have hard traced shadows; raster PCSS is an artistic
  approximation and can differ from refinement.
- Finite raster shadow maps can show fine-detail aliasing, particularly at the
  lower mobile budget. Stronger value separation can make those artifacts visible.
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
GitHub Pages workflow. Persisted schema version 7 discards older settings and
presets without migration or notice. Reverting the PR restores the prior code;
previous local settings discarded by the new schema cannot be recovered by code
rollback alone.
