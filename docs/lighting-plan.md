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
