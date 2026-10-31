# Homepage Floating Island

## 1. Scope / Trigger

Use this contract when changing the public homepage landscape, its Blender export, or its motion behavior. The owning files are:

- `web/src/routes/+page.svelte`: mounts the same scene for both anonymous and signed-in visitors.
- `web/src/lib/components/3D/floating_island.svelte`: responsive loading, theme subscription and localized poster description.
- `web/src/lib/components/3D/floating_island.ts`: client-only Three.js renderer and static batching.
- `web/src/lib/components/3D/island_day_night.ts`: owned celestial bodies, halos and hiker headlamps.
- `web/src/lib/components/3D/island_drag.ts`: lifecycle-owned horizontal mouse dragging without intercepting foreground content.
- `web/static/models/floating-island.glb`, `floating-island-poster.webp`, `floating-island-night-poster.webp` and `island-cloud-background.webp`: self-contained model, matching transparent day/night fallbacks and static sky image.

Keep the public homepage search and curated data flow intact. Authentication must not remove the scene or replace the homepage with a personal feed. Personal trails belong to the protected user center. Replace the complete old visual block; retaining its diorama images would cover the new model.

## 2. Signatures

```ts
type IslandState = "loading" | "ready" | "fallback";
interface IslandSnapshot {
    state: IslandState;
    paused: boolean;
}
interface IslandController {
    toggleMotion(): void;
    rotate(direction: -1 | 1): void;
    reset(): void;
    setDarkMode(dark: boolean): void;
    destroy(): void;
}

createFloatingIsland(container: HTMLDivElement, options: {
    dark: boolean;
    onChange(snapshot: IslandSnapshot): void;
}): IslandController;
mergeStaticMeshes(model: THREE.Object3D, clip: THREE.AnimationClip): void;
createIslandDrag(stage: HTMLDivElement, canvas: HTMLCanvasElement, options: {
    canDrag(): boolean;
    getYaw(): number;
    setYaw(yaw: number): void;
}): { cancel(): void; dispose(): void };
```

`paused` represents the motion preference/control state. Background or offscreen suspension does not change it. `rotate` changes the target yaw by `direction * .18`, clamped to `[-.55, .55]`. `reset` restores the view yaw without restarting the route. Theme changes update lights and exposure through the existing controller; they do not reload the model.

## 3. Contracts

### Component lifetime and layout

The component imports runtime types only at module scope. Its synchronous `onMount` callback registers a `(min-width: 64rem)` media listener and dynamically imports the renderer only on desktop. Keep browser API use inside the mounted runtime. A generation counter and mounted flag reject stale imports/callbacks after a viewport change or unmount. The `onMount` return value must remain a synchronous cleanup function.

Crossing below the desktop breakpoint destroys the controller. Returning to desktop creates a fresh instance. The scene lives inside the homepage hero right grid cell: `.island-backdrop` is relative, full width and has a measurable `clamp(30rem, 42vw, 35rem)` desktop height. The stage fills that box with normal pointer hit testing; sky/posters remain noninteractive. The scene has no visible drag hint or rotation, pause/play and reset toolbar. Scrolling away from the hero must move the scene away and let the existing IntersectionObserver suspend rendering. Keep the scene hidden below `lg`; do not create a mobile 3D instance.

The stage owns the translated image description; the poster has an empty alt and the canvas is hidden from assistive technology. Keep the description localized in both catalogs. Do not leave `aria-describedby` pointing to the removed drag hint.

### State and fallback

The Svelte snapshot starts at `fallback`, allowing the poster to render before client initialization. Runtime creation publishes `loading`; only a successfully rendered model frame publishes `ready`. The poster stays visible in `loading` and `fallback`, and is hidden only in `ready`. The removed toolbar stays absent in all states.

Both day and night poster images have static SSR `src` values; the existing global `.dark` class selects their display in CSS. Do not select the initial image `src` from the client theme store: the server defaults to light, while localStorage may start dark, and Svelte ignores hydration-time source mismatches. Capture matching transparent previews from the actual renderer for the glowing sun, moon and headlamps; keep the sky separate so no background rectangle is baked into either image.

The stage exposes `data-scene-state` and `data-motion`. A successful frame also publishes `data-scene-animation="IslandLoop"`, `data-scene-duration="64"` and `data-scene-draw-calls`. These DOM attributes support inspection without a global debug API; the draw-call value is observational, not a fixed performance assertion.

### One animation clock

Advance one accumulated `elapsed` value only while motion is enabled and the scene is visible. Use `loopTime = elapsed % duration` for the mixer, water uniform and whole-scene drift. The baked clip owns hiker root motion, walking joints and cloud drift. The parent world additionally translates by `x=.12*sin(2πt/32)` and `y=.14*sin(2πt/16)`, with no tilt. Move the whole model so hikers remain grounded relative to the bridge and terrain. All added periods divide 64. Do not add an independent clock, CSS cloud/star animation, or another hiker path.

The initial `prefers-reduced-motion: reduce` value pauses all continuous scene effects. Media changes update that preference, including resuming when reduced motion is disabled. A paused scene stops requesting frames once view damping settles. Rotate/reset, resize and theme changes may render the requested view without advancing the animation.

Both `IntersectionObserver` and `document.visibilitychange` suspend RAF. Reset the previous frame timestamp when becoming visible or resuming motion so hidden time is not added to `elapsed`. Use the real visible delta for the route; only camera damping caps its delta.

### Horizontal mouse control

The hero-contained stage/canvas accept direct pointer hits. Retain owner-document PointerEvent delegation, which also supports a direct `section.hero` target without an intercepting overlay. Accept only a primary left mouse press inside the stage bounds on a direct target of body, html, stage, canvas or `section.hero`. Do not use `closest('.hero')`: nested search fields, links, buttons, copy, cards and other foreground content must keep their native input and selection behavior. Do not intercept wheel, touch or pen input.

At pointerdown, start from the current visual yaw; subsequent horizontal displacement adds `deltaX * .004` to that starting yaw. The runtime clamps the target to `[-.55, .55]` and reuses the existing damping and RAF. Do not add pitch or another animation clock. Dragging remains available while paused; after damping settles, canvas pixels freeze again without advancing hikers, clouds, water or drift.

Use pointer capture and release it on up, cancel, lost capture, window blur, pointer exit, hidden/offscreen suspension, context loss and disposal. Restore only cursor styles still owned by this gesture, including their previous priority; do not overwrite another owner's subsequent changes. `dispose()` removes listeners and cancels idempotently. The drag hint and view buttons were removed at the user's request; do not reintroduce their toolbar.

### Model and renderer

Load `/models/floating-island.glb`. The runtime requires an `IslandLoop` clip within `.001` seconds of 64 and semantic `web_role` values `main_island`, `hiker_blue`, `hiker_red` and `cloud`. Water inherits `water_surface` or `water_cascade` roles and uses cloned materials with the shared time uniform.

The bundled water has no UV attributes. Use interpolated local positions: cascade local `-Y` is world-down, while river flow advances toward `+Z`. Cascade phases `9y+3πt` and `14y+4πt` produce downward white/cyan packets, with spatial lanes across X; surface ripple phase `11z-πt` advances toward the front. Preserve visible contrast: the original `.025` color wave was too faint to communicate flowing water. Asset animation tests cannot establish shader visibility; verify actual rendered water independently of moving hikers or world drift.

The static sky image is copied from the user's personal-site reference. Render it behind the transparent canvas and poster inside an isolated stage. Its ellipse mask must use `closest-side` and reach transparent at 100%, so dark mode does not reveal a rectangular image edge at the stage boundary. Dark mode tints and dims only this image; it introduces no CSS animation, clock or global page background changes.

### Day/night objects and headlamps

Create the day/night helper after batching and attach additions to the existing model. The original semantic sun is visible by day with a warm, steady halo. Preserve its golden shading and highlight: cloned solar materials use emissive intensity `.42` with tone mapping enabled, and the halo uses opacity `.40`, scale `3.1` and radial falloff power `1.15`. The user rejected the earlier stronger, clipped yellow appearance. Restore original solar material references on disposal.

The independent sibling moon is a beveled, extruded 3D crescent visible at night. Its outer radius is `.60`, inner radius `.55` and inner-circle X offset `.25`; depth `.10` and bevels retain a solid curved body with a physically empty centre/right cutout. The face has warm ivory emission `1.7`. Generate the aura from distances to the actual restricted arcs and tips, with blur `.15` and opacity `.80`; complete-circle distances produce an unwanted ghost ring on the open side. Both bodies must visibly emit light with a soft aura. Do not put the moon below the hidden sun root, fill its cutout with a glowing disc, add a pulsing clock or require a full-screen bloom pass.

Find hikers by semantic roles and attach headlamp groups to their animated, unscaled Body nodes. Actual glTF forward is local -Z and up +Y; the existing Blender-axis extras are stale. Lamps near Body-local `(0,.672,-.128)` point forward/down toward `(0,-.08,-1.4)`. Keep lamp hardware in daylight and switch the lenses, halos and two non-shadow-casting spotlights on at night. Parent attachment carries gait and route turning without another animation update.

The helper API is `createIslandDayNight(model, dark) -> {setDarkMode(dark), dispose()}`. Cache the latest dark flag in the runtime before model completion, then pass it to helper creation. Theme changes update visibility and intensity on the existing model, including while animation is paused. `data-scene-celestial` and `data-scene-headlamps` expose this state for inspection; verify the actual image as well.

The helper owns all added geometries, materials, lights and its shared radial DataTexture. Three's default Sprite geometry is module-global: clone one helper-owned geometry for the glow sprites before rendering and dispose that clone exactly once. Do not dispose the global shared geometry. Detach helper additions before general scene disposal to avoid duplicate resource release; dispose the original model through the existing runtime owner.

The bundled asset has one 64-second clip, four cloud roots and a rear snow-mountain peak at Three.js world Y `4.9296`. The authored route takes each hiker around the mountain once and across the bridge twice per loop. Preserve source geometry, bridge contact and the actual endpoint pose when re-exporting.

### Ribbon winding / flicker contract

Offset ribbon quads can fold over themselves at tight bends or repeated path stems. An upward original quad normal does not guarantee that each exported triangle faces upward. In a DoubleSide material, a downward triangle with an upward stored normal is shaded as a dark backface; a coplanar upward neighbour then alternates with it as the island drifts. The reported bridge-water and east-trail black flicker reproduced even with shadows fully disabled.

Before exporting trails, continuous sand banks and turquoise river layers, freeze Blender's existing `mesh.calc_loop_triangles()` tessellation and reverse only downward top triangles. In Blender the top direction is world +Z; in the exported Three.js scene it is world +Y. Preserve the original unordered triangle vertex triples, vertex coordinates, height planes, materials, hierarchy and animation channels. A fixed diagonal retriangulation can change the footprint or terrain interpolation of folded/nonplanar quads, even when all vertex coordinates are unchanged.

The task's `repair/repair_ribbon_winding.py` records verified backups and geometry/animation evidence for this operation. Run the repair after regenerating the ribbon geometry and before publishing a new GLB. The actual-GLB regression checks all 19 ribbon meshes and requires both an upward geometric triangle normal and agreement with transformed stored shading normals. Validate with shadows enabled and animation playing; use a shadows-off comparison to distinguish geometry defects from shadow-map artefacts. Do not use depth-test disabling or global shadow changes to conceal incorrect face winding.

Static batching operates within semantic island/cloud/sun roots, baking geometry into that root's coordinates. Exclude animation targets and intervening animated branches, hikers, water, skinned/morph meshes, multi-material meshes and meshes with children. Preserve animated world transforms throughout the loop, not just the starting pose.

The transparent orthographic renderer uses camera position `(.36, 16.2, 20)`, target `(0, 1.2, 0)`, and a minimum view height of `12.8`, expanded for narrow containers. Pixel ratio is capped at `1.7`. Use `THREE.PCFShadowMap`; the installed Three.js version does not expose the former soft-shadow constant. Avoid shadow casting by clouds, sun, water, cliffs, meadow, trails and sand banks. Keep the fallback transparent without a baked studio-floor rectangle.

### Disposal

`destroy()` is idempotent. Cancel RAF, abort event listeners, disconnect resize/intersection observers, stop mixer actions, dispose unique geometries/materials/textures and replaced water materials, call `key.shadow.dispose()` and `renderer.dispose()`, then remove the canvas. A late GLTF completion must dispose its scene instead of attaching it. Component cleanup invalidates pending imports before destroying the current controller.

## 4. Validation & Error Matrix

| Condition | Observable result |
|---|---|
| SSR or viewport below `64rem` | No renderer import/creation; mobile content retains its layout |
| Runtime/model loading | Poster visible, state `loading`, toolbar absent |
| First successful model frame | State `ready`, canvas visible, toolbar absent |
| Dynamic import/WebGL initialization failure | State `fallback`; poster remains usable |
| Network error, missing role or invalid clip duration | State `fallback`; runtime destroys its resources |
| WebGL context lost | Prevent default, cancel RAF, show fallback poster |
| Context restored | Reset frame timestamp, resize and render; successful frame returns to `ready` |
| Hidden tab/offscreen | RAF suspended; resume without accumulating hidden time |
| Primary left mouse on empty stage/hero | Horizontal clamped yaw changes; paused animation time stays frozen |
| Search/copy/control target, wheel, touch or pen | Native foreground interaction; no scene drag begins |
| Drag cancellation/context loss/disposal | Capture released, owned cursor restored, listeners disposed on teardown |
| Unmount or desktop-to-mobile transition during loading | Stale callbacks ignored; late model resources disposed |

## 5. Good / Base / Bad Cases

- Good: an anonymous or signed-in desktop visitor sees the matching poster while loading, then the animated island; pause freezes hikers, clouds and water together, and play continues from that pose.
- Base: reduced motion starts with a still scene. Theme changes and direct mouse dragging remain usable without resetting the route. Mobile retains the existing compact homepage.
- Bad: retaining the old PNG overlay, creating a new renderer on theme changes, or merging hiker/animated branches can hide the new scene, leak GPU resources or break the authored loop.

## 6. Tests Required

`web/src/lib/components/3D/floating_island.test.ts` parses the real bundled GLB. Preserve assertions for:

- Exactly one `IslandLoop` at 64 seconds, required roles, four clouds and peak Y `4.9296`.
- Hiker/cloud transforms change and walking-joint values vary; root translation alone is insufficient.
- The actual clamped 64-second endpoint matches the initial world matrices within `.0001`; comparing modulo time to zero cannot prove closure.
- All real top-ribbon triangles face upward and agree with their shading normals; the pre-fix asset failed on 213 faces.
- Static batching reduces meshes below 75% of the original count while preserving animated world matrices at `0, 8, 24, 48, 63.9` seconds within `.0001`.

`web/tests/playwright/components/home-island.spec.ts` covers ready/clip attributes, removal of old diorama images, loaded/visible sky image, scene bounds contained to the hero right side, scrolling with its hero, paused pixels, real direct-canvas dragging and native search-input selection, resumed motion, reduced-motion initialization and media changes, absence of the toolbar/hint on desktop and mobile, content order and horizontal overflow. Catalog tests cover both locale catalogs. Browser acceptance also checks theme changes, fallback/context recovery, hidden-tab resume and leaving/re-entering the homepage. Do not infer these runtime behaviors solely from asset tests.

`island_day_night.test.ts` loads the actual GLB and verifies sun/moon visibility, stable model/animation identity across themes, real hat/nose/Body anchors and forward/down spotlight targets through multiple gait poses. Its lifecycle check collects Mesh and Sprite geometries, materials and texture disposal events and requires exact-once cleanup with scene detachment.

The same day/night tests raycast the crescent to require empty centre/open-side samples and solid curved-body samples, inspect real thickness and emissive materials, and sample aura alpha to reject a full-circle ghost. Solar material checks require moderate emission, tone mapping, source-reference restoration and no disposal of borrowed textures/global Sprite geometry.

`island_drag.test.ts` uses real jsdom PointerEvents to check direct stage/canvas hits and direct-target delegation, horizontal-only yaw from the visible starting angle, native foreground/wheel behavior, mouse-only guards, capture cancellation, listener disposal and cursor ownership. Browser acceptance must additionally pause the actual scene, drag empty landscape, wait for damping, confirm a changed then stable canvas, and confirm dragging the search field leaves that paused canvas unchanged.

From `web/`, run `npm run check`, `npm run test:unit -- --run` and `npm run build`. Run browser tests against a safe local/built application following [Quality Guidelines](./quality-guidelines.md); never run legacy account teardown against an existing human-owned database.

## 7. Wrong vs Correct

```ts
// Wrong: an async onMount callback cannot return Svelte's synchronous cleanup.
onMount(async () => {
    const runtime = await import("./floating_island");
    const controller = runtime.createFloatingIsland(stage, options);
    return () => controller.destroy();
});

// Correct: keep the cleanup synchronous and reject late initialization.
onMount(() => {
    let mounted = true;
    let controller: IslandController | undefined;
    void import("./floating_island").then(({ createFloatingIsland }) => {
        if (mounted) controller = createFloatingIsland(stage, options);
    });
    return () => { mounted = false; controller?.destroy(); };
});
```

The component additionally checks desktop media and a generation counter and catches import/initialization failures. Preserve those guards when adapting this abbreviated lifecycle example.
