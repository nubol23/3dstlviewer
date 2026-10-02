# Lighting and value pipeline rewrite

Approved scope: one branch, `feature/lighting-value-pipeline-rewrite`, and one PR.
The four commit groups below must remain independently buildable and reviewable.

## Rendering contract

- Reuse established libraries for light transport, shadows, normal reconstruction,
  HDR targets, tone mapping, and ambient occlusion. Custom code is limited to
  integration, painting controls/presets, and the value post effect.
- Use MeshPhysicalMaterial with roughness 1, metalness 0, and specularIntensity 0
  in both tiers. Rafael approved this correction because MeshStandardMaterial
  has no independent specular intensity control. Environment irradiance remains
  enabled; there is no custom material shader or per-tier material translation.
- One GradientEquirectTexture is assigned to scene.environment in both tiers.
  Physical materials receive raster diffuse irradiance directly. No LightProbe,
  cubemap conversion, or material translation is introduced.
- Broad zenithal blends a concentrated overhead directional source and the shared
  gradient environment. Strict zenithal uses restrained environment illumination.
- Directional and dual setups use one or two independently shadowed directional
  lights. Local studio uses a spotlight with actual distance falloff. Reflected
  fill uses environment/floor illumination, approximate in raster and traced in
  refinement. Distances are relative to model height, not meters.
- Raster has one shared Shadow Softness control using library PCSS. No custom
  per-light PCSS patch. Per-source physical size is honored only where supported
  by refinement; directional lights remain infinitely distant sources.
- AgX is fixed and identical in both tiers, immediately before perceptual
  lightness extraction. Exposure is manual and stable. No selectable curves.
- Continuous and 3–8-band views consume the same lighting output. Pre-quantization
  depth-aware smoothing replaces triangle island cleanup, exposed as one radius.
  Zero disables it; larger radii deliberately simplify small value regions.
- One Contrast control adjusts perceptual lightness after smoothing and before
  quantization in both tiers. Its bounded, monotonic curve separates the light
  and shadow families while preserving gradations inside shadows. Exposure and
  AgX remain fixed during orbiting; no histogram normalization is introduced.
- Delete the custom lighting shader, band cleanup, worker, worker client,
  protocol, and their dedicated tests and UI plumbing.
- Bump persisted state version; discard older settings/presets with no migration,
  compatibility reader, aliases, or old-format notice.

## Backend spike and refinement gate

Raster WebGL ships independently. Before commit group 3, test the published
WebGLPathTracer in the interactive renderer's existing context on the reference
bust. Verify scene/environment/material consistency, camera and lighting resets,
resizing, cleanup, progress, cancellation, and value postprocessing.

Only if this class is broken or unusable, evaluate desktop WebGPU refinement.
That fork replaces WebGL postprocessing, N8AO, and drei SoftShadows integrations
with Three.js TSL postprocessing, its AO node for approximate previews, and a
custom TSL value-band node. Traced output receives no additional AO. WebGPU uses
a separate context; memory and switching costs must be measured. If neither
backend passes, omit refinement entirely and document that result in the PR.

## Initial budgets, subject to measurement

| Setting | Mobile raster | Desktop raster | Desktop refinement |
| --- | --- | --- | --- |
| DPR | 1 | 1.5 maximum | independent, longest edge initially 1280 px |
| Shadow maps | 1024 primary / 512 secondary | 2048 primary / 1024 secondary | native visibility |
| PCSS samples | 8 | 16 | native sources |
| AO | half-resolution low | half-resolution medium | no extra AO |
| Sampling | on demand | on demand | 64 samples or 5 seconds, whichever first |
| Path depth | n/a | n/a | initially 3 |

Refinement is feature-detected, desktop-only, and lazy-loaded. It reports sample
progress, allows stopping, invalidates on scene/camera changes, and stops at its
budget. A time limit is not a convergence claim. Rendering stops when idle or
hidden; obsolete resources are disposed. Mobile keeps all raster study controls.
Everything must work as a static GitHub Pages build under its deployment base.

## Commit groups in one PR

1. Upgrade three, fiber, drei, postprocessing, and required peers as a tested set;
   add crease-aware normals. No other intentional visual change.
2. Replace raster lighting, environment, PCSS, AO, HDR/value effect, smoothing,
   presets, controls, mobile budgets, and persistence; delete the old lighting and
   cleanup stack. This is an independently shippable raster milestone.
3. Add complete refinement only after a successful spike. Do not ship a partial
   or failed path. The spike may run alongside groups 1 and 2.
4. Add independent source/environment/floor colors and neutral grayscale
   comparison. Colors affect illumination before value extraction.

## Acceptance and handoff

Use a detailed bust and full miniature with folds, facial cavities, overhangs,
and sharp details. Verify broad zenithal form, directional shadows, distinct
distance/intensity/softness behavior, independent second-light visibility,
continuous/stepped agreement, smoothing without silhouette bleeding, preserved
geometry and crease-aware shading, and traced floor reflection where available.

Record before/after bust stills for every preset in continuous and stepped modes,
plus a short orbit/light-manipulation recording. Measure frame times, preparation
and refinement times, memory, and idle behavior; distinguish mobile emulation
from measurements on a physical mobile device. Report exact dependency versions,
spike/backend result, checks actually run, and remaining approximations.

Raster environment visibility, AO, global PCSS, screen-space smoothing, and
preview/refinement differences remain approximations. Finite sampling can retain
noise. Literal primer spray deposition is outside scope.

Reference models are military bust 3d model.stl (1,968,612 triangles) and
Fantasy_Archer_32mm_tabletop.stl (1,965,419 triangles). Read the user-owned files
in place. Never copy, commit, or add them as fixtures. Report normal preparation,
BVH build, memory, and mobile load behavior at full resolution, with no silent
decimation. Only the existing three small STL fixtures are committed test meshes.

Ground emphasis: raster ground does not receive model cast shadows. Model
self-shadowing stays enabled. Ground Reflectance controls floor albedo and the
gradient's lower-hemisphere approximation; refinement calculates ground bounce.
The ground remains present in traced visibility because that affects illumination
reaching the model.

## Backend result

The full 1,968,612-triangle bust passed the same-context WebGL spike. Initial
scene/BVH preparation took 13.94 seconds, first sample 1.02 seconds afterward,
and a five-second sampling interval produced 33.67 samples at the spike's half
resolution. Main-browser reported peak heap was 2.61 GB; this is not total GPU
or worker memory. WebGL refinement is selected. The WebGPU fork is not shipped.

The integrated tier uses a 960-pixel longest-edge cap, three path bounces, and
64 samples or five seconds after the first sample. Shader compilation and scene
preparation are reported separately. It reuses the package's DenoiseMaterial
before the same AgX/value passes. Software renderers and mobile devices do not
expose refinement. Known software renderers can support WebGL while still being
unusable for the large path-tracing shader, so float-buffer support alone is not
a sufficient feature check.

Color controls set each source, the environment's upper gradient, and the floor
independently. Neutral Grayscale compares the same rendered lightness without
rebuilding illumination. Colored value studies move toward white/black to reach
the requested study lightness without clipping saturated RGB channels; this is
an artistic presentation, not extra light transport. Persistence version 8
includes these fields and drops all older records without a compatibility path.

## Approved contrast correction

The painted-miniature references require stronger value separation than the
initial rewrite, including in directional and local studio lighting. Keep
reflected illumination visible within the shadow family rather than clipping
it to black. Apply this correction on the same branch and PR after the four
original commit groups.

Use the existing perceptual value effect for a symmetric rational contrast gain,
with a default of 2.2 and a supported range of 1–3. A setting of 1 is neutral.
Endpoints and midpoint stay fixed; the minimum slope is 1 / contrast, so dark
gradations remain distinct before optional band quantization. Keep the existing
8–94 output-lightness range and manual exposure of 1. Default five-band
thresholds are 0.2, 0.4, 0.6 and 0.8, retaining two values below the midpoint.

Increase the default key intensity to 5.5, use a subordinate second-source ratio
of 0.3, and keep environment/ground fill for shadow definition. Broad zenithal
uses spread 0.35 and environment strength 0.18; strict zenithal uses 0.18,
directional/local/dual use 0.25, and reflected fill uses 0.35. Reduce default
smoothing to 0.5 pixels and refine the existing library denoiser settings without
changing its sampling or resolution budget. This is artistic value shaping,
not a claim that uniform matte geometry reproduces painted texture or metallic
highlights in the reference photographs.

Verify continuous and stepped images on both reference sculpts. Check stronger
light/shadow separation and retained shadow variation, persistence of the new
control, and display-only adjustment of completed refinement. Bump persistence
to version 8 for the integrated changes and discard earlier presets without migration.

## Broad-sky interpretation and color shortcut follow-up

Keep broad zenithal softer for scattered-sky studies; use the existing Contrast
control for a more graphic interpretation. Document that the default blends
an overhead source with the gradient and is not a calibrated CIE overcast sky.
Do not introduce a hidden per-preset curve. The primary dome remains adjustable
outside zenithal modes, and the second directional source keeps separate angles.

Add Cool Blue Fill and Monochrome actions to double-directional and reflected
lighting controls, on desktop and mobile. Reuse the existing color fields and
grayscale switch; preserve the selected key color, angles, intensities and
exposure. Choose a muted blue secondary light with blue-gray environment/ground
fill. Keep individual color editing and persistence, with no schema change.

## Opposing second light

Double Directional enables Keep Second Light Opposite when its lighting setup
is applied. While enabled, store the second azimuth as the main azimuth plus
180 degrees, modulo 360. Both the primary dome and its sliders update that angle.
Disable only the second azimuth slider while linked; keep its value visible.
The second elevation stays independent and is never mirrored below the model.

Unlink at the current secondary direction, with no position change. Independent
direction edits then behave as before; relinking aligns only azimuth. Preserve
Second Light Ratio at its existing 0–2 range and 0.3 preset default, and keep the
shared Shadow Softness behavior. This is an opposing artistic fill source.

Use the same canonical light state in raster and refinement and the same control
on desktop/mobile. Store the boolean with settings and saved presets. Persistence
version 8 discards older records under the existing no-migration policy. Verify
wrapping, unlink continuity, independent elevation/ratio, lock behavior, reload,
preset restore, mobile controls and refinement after moving the linked lights.

## Warm main-light shortcut

Add a Warm Key Light checkbox on desktop and mobile. Checking selects pale
yellow #FFE2B3 and enables color presentation; unchecking selects white without
changing the secondary/environment/floor colors. Use the existing key-color
field for selection, persistence and both renderers, retaining custom color
editing and manual grayscale comparison. Default setups remain white. This
shortcut adds no stored field or schema reset.

## Control revamp

The control layer was redesigned without changing the rendering contract above.
The Warm Key Light checkbox and the Cool Blue Fill and Monochrome buttons are
replaced by one Colors section shown in every setup. The key light offers White,
Warm (#FFE2B3) or a custom color. The fill offers Neutral (white second light and
sky, #888888 floor), Cool blue (the same muted blue palette as before) or custom
second-light, environment and floor colors. Choosing Warm or Cool blue turns off
Neutral Grayscale, as before; Neutral Grayscale remains the only grayscale
control. Choosing a lighting setup now loads its default light and returns every
color, floor color included, to white and neutral. Floor reflectance is kept.
Presets can be renamed and deleted (with undo), saving stops at eight instead of
dropping the oldest, and presets can be saved while the light is locked. Light
colors, angles, intensities and the stored schema are unchanged.
Band boundaries are edited as handles on the stepped ramp, one percent apart at
minimum, replacing the per-boundary sliders; their stored values are unchanged.
Refinement is started, followed and stopped from a viewport control with the
same phases and budget as before.

## Mobile render quality

Phones and tablets now render the same study as desktop: 2048/1024 shadow maps,
16 PCSS samples, Medium half-resolution AO and Medium SMAA. Touch screens, and
any window up to 1024 px wide, render at the device pixel ratio capped at 2
instead of 1; wider desktop windows keep their 1.5 cap. While
the user orbits or changes a light, the library's performance regression lowers
touch rendering to a 1x ratio and restores 2x 400 ms after the last change, so the
image being studied is always full quality. Camera transitions and resizes do not
regress, which keeps a resting view from cycling between ratios. Refinement remains desktop-only. On a 390 px
phone viewport this removes the blur and shadow speckle of the previous mobile
budget; the resting image matched the desktop budget pixel for pixel in Chrome
emulation. Frame cost on a physical phone is not measured yet.


## Soft-shadow noise on phones

drei's PCSS rotates each pixel's Vogel sample disk by an angle from a
fract(sin(...)) hash of the screen coordinate. Phone GPUs evaluate sin of those
large arguments inaccurately, so neighboring pixels receive clumped angles and
penumbrae speckle even at 16 samples. The viewer swaps only that angle for
interleaved gradient noise as drei writes its shader chunk; the PCSS blocker
search, filter, sample count and softness are unchanged, and desktop renders are
visually identical. If drei changes the injected angle line, loading fails with
an explicit error instead of silently keeping the old noise.
