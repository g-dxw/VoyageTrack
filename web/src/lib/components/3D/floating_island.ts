import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createIslandDayNight, type IslandDayNight } from "./island_day_night";
import { createIslandDrag } from "./island_drag";

export type IslandState = "loading" | "ready" | "fallback";
export interface IslandSnapshot {
    state: IslandState;
    paused: boolean;
}
export interface IslandController {
    toggleMotion(): void;
    rotate(direction: -1 | 1): void;
    reset(): void;
    setDarkMode(dark: boolean): void;
    destroy(): void;
}
interface IslandOptions {
    dark: boolean;
    onChange(snapshot: IslandSnapshot): void;
}

const MODEL_URL = "/models/floating-island.glb";
const SCENERY_ROLES = new Set([
    "main_island", "satellite_left", "satellite_right", "satellite_lagoon", "sun", "cloud",
]);

function roleOf(object: THREE.Object3D): string {
    for (let current: THREE.Object3D | null = object; current; current = current.parent) {
        const role: unknown = current.userData.web_role;
        if (typeof role === "string") return role;
    }
    return "";
}

function skipsShadow(object: THREE.Object3D, role: string): boolean {
    if (["water_cascade", "water_surface", "cloud", "sun"].includes(role)) return true;
    for (let current: THREE.Object3D | null = object; current; current = current.parent) {
        if (/cliff|solid.*meadow|continuous.*sand.*bank|^Trail/i.test(current.name)) return true;
    }
    return false;
}

function disposeObjects(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) {
                if (value instanceof THREE.Texture) textures.add(value);
            }
        }
    });
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
}

// Preserve animated branches and bake only immutable descendants into the local
// coordinates of their island/cloud root. The source model stays editable.
export function mergeStaticMeshes(model: THREE.Object3D, clip: THREE.AnimationClip): void {
    const animated = new Set<THREE.Object3D>();
    for (const track of clip.tracks) {
        const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
        const node: unknown = THREE.PropertyBinding.findNode(model, name);
        if (node instanceof THREE.Object3D) animated.add(node);
    }
    const groups = new Map<string, { root: THREE.Object3D; objects: THREE.Mesh[] }>();
    const removed = new Set<THREE.BufferGeometry>();
    model.updateMatrixWorld(true);
    model.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.children.length || object instanceof THREE.SkinnedMesh || object.morphTargetInfluences?.length || Array.isArray(object.material)) return;
        if (["water_cascade", "water_surface", "hiker_blue", "hiker_red"].includes(roleOf(object))) return;
        let root = object.parent;
        while (root && !SCENERY_ROLES.has(roleOf(root))) {
            if (animated.has(root)) return;
            root = root.parent;
        }
        // Use the semantic root itself, not a nested branch inheriting its role.
        while (root && typeof root.userData.web_role !== "string") root = root.parent;
        if (!root || animated.has(object)) return;
        for (let parent = object.parent; parent && parent !== root; parent = parent.parent) {
            if (animated.has(parent)) return;
        }
        const geometry: unknown = object.geometry;
        if (!(geometry instanceof THREE.BufferGeometry)) return;
        const attributes: string[] = [];
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            if (!(attribute instanceof THREE.BufferAttribute) && !(attribute instanceof THREE.InterleavedBufferAttribute)) return;
            const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
            attributes.push(`${name}:${attribute.itemSize}:${attribute.normalized}:${array.constructor.name}`);
        }
        const signature = attributes.sort().join("|");
        const key = `${root.uuid}/${object.material.uuid}/${object.castShadow}/${object.receiveShadow}/${signature}`;
        let group = groups.get(key);
        if (!group) {
            group = { root, objects: [] };
            groups.set(key, group);
        }
        group.objects.push(object);
    });
    for (const { root, objects } of groups.values()) {
        if (objects.length < 2) continue;
        const inverse = root.matrixWorld.clone().invert();
        const geometries = objects.map((object) => (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld)));
        const geometry = mergeGeometries(geometries);
        geometries.forEach((item) => item.dispose());
        if (!geometry) continue;
        const first = objects[0];
        const combined = new THREE.Mesh(geometry, first.material);
        combined.name = `Static scenery ${root.name}`;
        combined.castShadow = first.castShadow;
        combined.receiveShadow = first.receiveShadow;
        root.add(combined);
        for (const object of objects) {
            removed.add(object.geometry);
            object.removeFromParent();
        }
    }
    const retained = new Set<THREE.BufferGeometry>();
    model.traverse((object) => {
        if (object instanceof THREE.Mesh) retained.add(object.geometry);
    });
    removed.forEach((geometry) => { if (!retained.has(geometry)) geometry.dispose(); });
}

/** Client-only renderer. The Svelte owner handles labels and component lifetime. */
export function createFloatingIsland(container: HTMLDivElement, options: IslandOptions): IslandController {
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    container.append(canvas);

    const camera = new THREE.OrthographicCamera(-6.4, 6.4, 6.4, -6.4, .1, 100);
    camera.position.set(.36, 16.2, 20);
    camera.lookAt(0, 1.2, 0);
    const hemisphere = new THREE.HemisphereLight(0xebf5ff, 0xe9c59a, 1.8);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffefd6, 2.8);
    key.position.set(-3.5, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 35 });
    key.shadow.bias = -.0004;
    key.shadow.normalBias = .025;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd1eaff, .8);
    fill.position.set(6, 7, 1);
    scene.add(fill);
    const world = new THREE.Group();
    scene.add(world);

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    const waterTime = { value: 0 };
    const waterMaterials = new Map<string, THREE.Material>();
    const replacedMaterials = new Set<THREE.Material>();
    let mixer: THREE.AnimationMixer | undefined;
    let dayNight: IslandDayNight | undefined;
    let darkMode = options.dark;
    let state: IslandState = "loading";
    let paused = media.matches;
    let ready = false, visible = true, disposed = false, contextLost = false;
    let frame = 0, last = 0, elapsed = 0, duration = 64, yaw = 0, targetYaw = 0;
    const drag = createIslandDrag(container, canvas, {
        canDrag: () => ready && visible && !disposed && !contextLost && !document.hidden,
        getYaw: () => yaw,
        setYaw: (next) => { targetYaw = THREE.MathUtils.clamp(next, -.55, .55); requestFrame(); },
    });

    function publish(nextState: IslandState = state): void {
        state = nextState;
        container.dataset.sceneState = state;
        container.dataset.motion = paused ? "paused" : "playing";
        options.onChange({ state, paused });
    }
    function requestFrame(): void {
        if (!frame && ready && !disposed && !contextLost && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    function resize(): void {
        const { width, height } = container.getBoundingClientRect();
        if (!width || !height || disposed || contextLost) return;
        const aspect = width / height;
        const viewHeight = Math.max(12.8, 12.8 / aspect);
        camera.left = -viewHeight * aspect / 2;
        camera.right = viewHeight * aspect / 2;
        camera.top = viewHeight / 2;
        camera.bottom = -viewHeight / 2;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        if (ready) renderer.render(scene, camera);
        requestFrame();
    }
    function render(now: number): void {
        frame = 0;
        if (disposed || contextLost || !visible || document.hidden || !mixer) return;
        const delta = Math.max(0, (now - last) / 1000);
        last = now;
        if (!paused) elapsed += delta;
        yaw = THREE.MathUtils.damp(yaw, targetYaw, 7, Math.min(delta, .05));
        world.rotation.y = yaw;
        // Drift the complete scene so hikers remain grounded on their terrain.
        // Both periods divide the authored 64-second loop; mountains stay upright.
        const loopTime = elapsed % duration;
        world.position.set(
            .12 * Math.sin(loopTime * Math.PI * 2 / 32),
            .14 * Math.sin(loopTime * Math.PI * 2 / 16),
            0,
        );
        // One visible-time clock keeps route, gait, clouds, drift and water in step.
        mixer.setTime(loopTime);
        waterTime.value = loopTime;
        renderer.render(scene, camera);
        if (state !== "ready") {
            container.dataset.sceneAnimation = "IslandLoop";
            container.dataset.sceneDuration = String(duration);
            container.dataset.sceneDrawCalls = String(renderer.info.render.calls);
            publish("ready");
        }
        if (!paused || Math.abs(yaw - targetYaw) > .0001) requestFrame();
    }
    function setDarkMode(dark: boolean): void {
        darkMode = dark;
        dayNight?.setDarkMode(dark);
        container.dataset.sceneCelestial = dark ? "moon" : "sun";
        container.dataset.sceneHeadlamps = dark ? "on" : "off";
        hemisphere.color.setHex(dark ? 0xbbd6ff : 0xebf5ff);
        hemisphere.groundColor.setHex(dark ? 0x263348 : 0xe9c59a);
        hemisphere.intensity = dark ? 1.25 : 1.8;
        key.color.setHex(dark ? 0xc7dfff : 0xffefd6);
        key.intensity = dark ? 1.65 : 2.8;
        fill.intensity = dark ? .65 : .8;
        renderer.toneMappingExposure = dark ? .95 : 1;
        requestFrame();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) { last = performance.now(); requestFrame(); }
        else { drag.cancel(); cancelAnimationFrame(frame); frame = 0; }
    }, { rootMargin: "100px" });
    visibilityObserver.observe(container);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { drag.cancel(); cancelAnimationFrame(frame); frame = 0; }
        else { last = performance.now(); requestFrame(); }
    }, { signal: events.signal });
    media.addEventListener("change", (event) => {
        paused = event.matches;
        last = performance.now();
        publish();
        requestFrame();
    }, { signal: events.signal });
    canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        contextLost = true;
        drag.cancel();
        cancelAnimationFrame(frame);
        frame = 0;
        publish("fallback");
    }, { signal: events.signal });
    canvas.addEventListener("webglcontextrestored", () => {
        contextLost = false;
        last = performance.now();
        resize();
        requestFrame();
    }, { signal: events.signal });

    function destroy(): void {
        if (disposed) return;
        disposed = true;
        drag.dispose();
        cancelAnimationFrame(frame);
        events.abort();
        resizeObserver.disconnect();
        visibilityObserver.disconnect();
        mixer?.stopAllAction();
        dayNight?.dispose();
        disposeObjects(scene);
        replacedMaterials.forEach((material) => material.dispose());
        key.shadow.dispose();
        renderer.dispose();
        canvas.remove();
    }

    publish();
    setDarkMode(options.dark);
    resize();
    void new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
        if (disposed) { disposeObjects(gltf.scene); return; }
        const roles = new Set<string>();
        gltf.scene.traverse((object) => {
            const role = roleOf(object);
            if (role) roles.add(role);
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = !skipsShadow(object, role);
            object.receiveShadow = role !== "cloud";
            if (role !== "water_cascade" && role !== "water_surface") return;
            const prepare = (material: THREE.Material): THREE.Material => {
                const id = `${material.uuid}/${role}`;
                let copy = waterMaterials.get(id);
                if (!copy) {
                    replacedMaterials.add(material);
                    copy = material.clone();
                    copy.onBeforeCompile = (shader) => {
                        shader.uniforms.uIslandTime = waterTime;
                        shader.vertexShader = `varying vec3 vIslandPosition;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvIslandPosition = transformed;");
                        // The GLB has no water UVs. Its curtains descend along
                        // local -Y and the river runs toward +Z, so use positions.
                        // All temporal frequencies close exactly at 64 seconds.
                        const flow = role === "water_cascade" ? `
                            float lane = pow(.5 + .5 * sin(vIslandPosition.x * 39.0 + .45 * sin(vIslandPosition.y * 1.8)), 5.0);
                            float fallPhase = vIslandPosition.y * 9.0 + uIslandTime * 9.42477796077 + sin(vIslandPosition.x * 19.0) * 2.4;
                            float packet = pow(.5 + .5 * sin(fallPhase), 7.0);
                            float fineLane = pow(.5 + .5 * sin(vIslandPosition.x * 67.0 + 1.6), 10.0);
                            float finePacket = pow(.5 + .5 * sin(vIslandPosition.y * 14.0 + uIslandTime * 12.56637061436), 10.0);
                            float whitewater = clamp(.12 * lane + .95 * lane * packet + .45 * fineLane * finePacket, 0.0, 1.0);
                            vec3 current = mix(diffuseColor.rgb, vec3(.015, .40, .69), .35) * .82;
                            diffuseColor.rgb = mix(current, vec3(.72, 1.0, 1.0), whitewater);
                        ` : `
                            float riverPhase = vIslandPosition.z * 11.0 - uIslandTime * 3.14159265359 + sin(vIslandPosition.x * 7.0) * .8;
                            float ripple = pow(.5 + .5 * sin(riverPhase), 10.0);
                            float ribbon = .35 + .65 * pow(.5 + .5 * sin(vIslandPosition.x * 22.0 + sin(vIslandPosition.z * 2.5 - uIslandTime * 1.57079632679)), 4.0);
                            diffuseColor.rgb = mix(diffuseColor.rgb * .94, vec3(.42, .92, 1.0), ripple * ribbon * .48);
                        `;
                        shader.fragmentShader = `uniform float uIslandTime;\nvarying vec3 vIslandPosition;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>\n${flow}`);
                    };
                    copy.customProgramCacheKey = () => `island-flow-${role}`;
                    waterMaterials.set(id, copy);
                }
                return copy;
            };
            object.material = Array.isArray(object.material) ? object.material.map(prepare) : prepare(object.material);
        });
        const clip = gltf.animations.find((animation) => animation.name === "IslandLoop");
        if (!clip || Math.abs(clip.duration - 64) > .001 || !["main_island", "hiker_blue", "hiker_red", "cloud"].every((role) => roles.has(role))) {
            disposeObjects(gltf.scene);
            throw new Error("The homepage model is missing its landscape or unified hiking loop.");
        }
        mergeStaticMeshes(gltf.scene, clip);
        duration = clip.duration;
        world.add(gltf.scene);
        mixer = new THREE.AnimationMixer(gltf.scene);
        mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
        mixer.setTime(0);
        dayNight = createIslandDayNight(gltf.scene, darkMode);
        ready = true;
        last = performance.now();
        resize();
        requestFrame();
    }).catch((error: unknown) => {
        if (disposed) return;
        publish("fallback");
        destroy();
        console.warn("The homepage landscape could not load; its preview remains available.", error);
    });

    return {
        toggleMotion() { paused = !paused; last = performance.now(); publish(); requestFrame(); },
        rotate(direction) { targetYaw = THREE.MathUtils.clamp(targetYaw + direction * .18, -.55, .55); requestFrame(); },
        reset() { targetYaw = 0; requestFrame(); },
        setDarkMode,
        destroy,
    };
}
