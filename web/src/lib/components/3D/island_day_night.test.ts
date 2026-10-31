import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeStaticMeshes } from "./floating_island";
import { createIslandDayNight } from "./island_day_night";

async function landscape() {
    const bytes = readFileSync(new URL("../../../../static/models/floating-island.glb", import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
    mergeStaticMeshes(gltf.scene, gltf.animations[0]);
    return gltf;
}

function find(root: THREE.Object3D, predicate: (object: THREE.Object3D) => boolean): THREE.Object3D {
    let result: THREE.Object3D | undefined;
    root.traverse((object) => { if (predicate(object)) result = object; });
    if (!result) throw new Error("Missing expected real-model anchor or effect");
    return result;
}
function named(root: THREE.Object3D, name: string): THREE.Object3D {
    return find(root, (object) => object.name === name);
}

describe("homepage day/night effects on the real GLB", () => {
    it("switches the celestial body and steady headlamps without replacing the model or advancing animation", async () => {
        const { scene } = await landscape();
        const sun = find(scene, (object) => object.userData.web_role === "sun");
        const effects = createIslandDayNight(scene, true);
        const moon = named(scene, "Island moon");
        const lamps = [named(scene, "Island headlamp 1"), named(scene, "Island headlamp 2")];
        const lights = lamps.map((lamp) => find(lamp, (object) => object instanceof THREE.SpotLight));
        expect(sun.visible).toBe(false);
        expect(moon.visible).toBe(true);
        expect(moon.parent).toBe(sun.parent);
        expect(moon.position.equals(sun.position)).toBe(true);
        expect(moon.quaternion.equals(sun.quaternion)).toBe(true);
        const ids: string[] = [];
        scene.traverse((object) => ids.push(object.uuid));
        scene.updateMatrixWorld(true);
        const poses = lamps.map((lamp) => lamp.matrixWorld.clone());
        effects.setDarkMode(false);
        expect(sun.visible).toBe(true);
        expect(moon.visible).toBe(false);
        lamps.forEach((lamp) => expect(lamp.visible).toBe(true));
        for (const light of lights) {
            if (!(light instanceof THREE.SpotLight)) throw new Error("Missing trail light");
            expect(light.intensity).toBe(0);
            expect(light.castShadow).toBe(false);
        }
        effects.setDarkMode(true);
        const after: string[] = [];
        scene.updateMatrixWorld(true);
        scene.traverse((object) => after.push(object.uuid));
        expect(after).toEqual(ids);
        lamps.forEach((lamp, index) => expect(lamp.matrixWorld.equals(poses[index])).toBe(true));
        for (const light of lights) {
            if (!(light instanceof THREE.SpotLight)) throw new Error("Missing trail light");
            expect(light.intensity).toBeGreaterThan(0);
            expect(light.color.r).toBeGreaterThan(light.color.b);
        }
        effects.dispose();
    });

    it("mounts hardware on actual hats and keeps each beam forward/down as hikers walk and turn", async () => {
        const { scene, animations: [clip] } = await landscape();
        const effects = createIslandDayNight(scene, true);
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(clip).play();
        const lamps = [named(scene, "Island headlamp 1"), named(scene, "Island headlamp 2")];
        const positions: THREE.Vector3[][] = [[], []];
        const directions: THREE.Vector3[][] = [[], []];
        for (const time of [0, 8, 24, 48]) {
            mixer.setTime(time);
            scene.updateMatrixWorld(true);
            lamps.forEach((lamp, index) => {
                const body = lamp.parent;
                if (!body) throw new Error("Detached headlamp");
                expect(body.name).toMatch(/_Body(?:[._]?\d+)?$/);
                const head = find(body, (object) => /_Head(?:[._]?\d+)?$/.test(object.name));
                const nose = find(body, (object) => /_Nose(?:[._]?\d+)?$/.test(object.name));
                const localHead = body.worldToLocal(head.getWorldPosition(new THREE.Vector3()));
                const forward = body.worldToLocal(nose.getWorldPosition(new THREE.Vector3())).sub(localHead);
                forward.y = 0;
                forward.normalize();
                const light = find(lamp, (object) => object instanceof THREE.SpotLight);
                if (!(light instanceof THREE.SpotLight)) throw new Error("Missing headlamp light");
                const origin = light.getWorldPosition(new THREE.Vector3());
                const direction = light.target.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
                const localDirection = direction.clone().transformDirection(body.matrixWorld.clone().invert());
                expect(localDirection.dot(forward)).toBeGreaterThan(.5);
                expect(localDirection.y).toBeLessThan(-.2);
                if (time === 0) {
                    const hat = new THREE.Box3();
                    body.traverse((object) => {
                        if (!(object instanceof THREE.Mesh) || !object.name.includes("_Hat")) return;
                        const attribute = object.geometry.getAttribute("position");
                        for (let i = 0; i < attribute.count; i++) hat.expandByPoint(body.worldToLocal(new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(object.matrixWorld)));
                    });
                    const localLens = body.worldToLocal(origin.clone());
                    expect(localLens.y).toBeGreaterThan(hat.min.y);
                    expect(localLens.y).toBeLessThan(hat.max.y);
                    expect(Math.abs(localLens.x)).toBeLessThan(hat.max.x);
                    expect(localLens.z).toBeLessThan(hat.getCenter(new THREE.Vector3()).z);
                    expect(localLens.z).toBeGreaterThan(hat.min.z - .05);
                }
                positions[index].push(origin);
                directions[index].push(direction);
            });
        }
        positions.forEach((path) => expect(path.some((point) => point.distanceTo(path[0]) > .5)).toBe(true));
        directions.forEach((path) => expect(path.some((direction) => direction.angleTo(path[0]) > .3)).toBe(true));
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
        effects.dispose();
    });

    it("has a thick crescent with an open centre and contour glow instead of a luminous full disc", async () => {
        const { scene } = await landscape();
        const effects = createIslandDayNight(scene, true);
        const moon = named(scene, "Island moon");
        const body = named(moon, "Island crescent body");
        if (!(body instanceof THREE.Mesh)) throw new Error("Missing crescent mesh");
        scene.updateMatrixWorld(true);
        const ray = new THREE.Raycaster();
        const hits = (x: number, z: number) => {
            ray.set(moon.localToWorld(new THREE.Vector3(x, 2, z)), new THREE.Vector3(0, -1, 0).transformDirection(moon.matrixWorld));
            return ray.intersectObject(body, false).length;
        };
        for (const [x, z] of [[0, 0], [.25, 0], [.40, .1]]) expect(hits(x, z), "Crescent cutout must remain physically empty").toBe(0);
        for (const [x, z] of [[-.45, 0], [-.25, .4], [-.25, -.4]]) expect(hits(x, z), "The curved lunar body must be solid").toBeGreaterThan(0);
        body.geometry.computeBoundingBox();
        const bounds = body.geometry.boundingBox;
        if (!bounds) throw new Error("Missing crescent bounds");
        expect(bounds.max.y - bounds.min.y, "The crescent must have real depth and bevels").toBeGreaterThan(.05);
        const surfaces = Array.isArray(body.material) ? body.material : [body.material];
        expect(surfaces.some((surface) => surface instanceof THREE.MeshStandardMaterial && surface.emissiveIntensity > 1 && surface.emissive.getHex() !== 0)).toBe(true);
        const aura = named(moon, "Island moon aura");
        if (!(aura instanceof THREE.Mesh) || !(aura.material instanceof THREE.MeshBasicMaterial) || !(aura.material.map instanceof THREE.DataTexture)) throw new Error("Missing contour aura");
        const { data, width, height } = aura.material.map.image;
        if (!(data instanceof Uint8Array)) throw new Error("Missing aura pixels");
        const alpha = (x: number, y: number) => data[(Math.floor((y / 2.4 + .5) * height) * width + Math.floor((x / 2.4 + .5) * width)) * 4 + 3] / 255;
        expect(alpha(0, 0), "Glow must fade in the crescent cutout").toBeLessThan(.03);
        expect(alpha(.75, 0), "The open side must not have a full-circle ghost ring").toBeLessThan(.01);
        expect(alpha(-.75, 0), "A visible outer aura must extend beyond the lunar body").toBeGreaterThan(.2);
        effects.dispose();
    });

    it("detaches additions and disposes shared glow textures and all new GPU resources exactly once", async () => {
        const { scene } = await landscape();
        const original = new Set<string>();
        scene.traverse((object) => original.add(object.uuid));
        const originalMaterials = new Set<THREE.Material>();
        const originalTextures = new Set<THREE.Texture>();
        const originalReferences = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        const sun = find(scene, (object) => object.userData.web_role === "sun");
        const borrowedTexture = new THREE.Texture();
        const originalSunSurface = find(sun, (object) => object instanceof THREE.Mesh);
        if (!(originalSunSurface instanceof THREE.Mesh)) throw new Error("Missing original sun surface");
        const sourceSurface = Array.isArray(originalSunSurface.material) ? originalSunSurface.material[0] : originalSunSurface.material;
        if (!(sourceSurface instanceof THREE.MeshStandardMaterial)) throw new Error("Unexpected source sun material");
        sourceSurface.map = borrowedTexture;
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            originalReferences.set(object, object.material);
            for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
                originalMaterials.add(surface);
                Object.values(surface).forEach((value) => { if (value instanceof THREE.Texture) originalTextures.add(value); });
            }
        });
        const borrowedDispose = vi.spyOn(borrowedTexture, "dispose");
        const effects = createIslandDayNight(scene, false);
        const geometries = new Set<THREE.BufferGeometry>();
        const spriteGeometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        const textures = new Set<THREE.Texture>();
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
            if (!original.has(object.uuid)) geometries.add(object.geometry);
            if (object instanceof THREE.Sprite) spriteGeometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (!originalMaterials.has(material)) materials.add(material);
                Object.values(material).forEach((value) => { if (value instanceof THREE.Texture && !originalTextures.has(value)) textures.add(value); });
            }
        });
        const spies = [...geometries].map((value) => vi.spyOn(value, "dispose"))
            .concat([...materials].map((value) => vi.spyOn(value, "dispose")))
            .concat([...textures].map((value) => vi.spyOn(value, "dispose")));
        expect(textures.size).toBeGreaterThan(0);
        expect(originalSunSurface.material).not.toBe(originalReferences.get(originalSunSurface));
        const litSunSurface = Array.isArray(originalSunSurface.material) ? originalSunSurface.material[0] : originalSunSurface.material;
        if (!(litSunSurface instanceof THREE.MeshStandardMaterial)) throw new Error("Missing emissive sun surface");
        expect(litSunSurface.emissiveIntensity).toBeGreaterThan(0);
        expect(litSunSurface.emissiveIntensity, "Solar emission must stay moderate instead of clipping to neon yellow").toBeLessThan(1);
        expect(litSunSurface.toneMapped, "Solar glow must preserve the golden body's shading and highlights").toBe(true);
        expect(litSunSurface.emissive.getHex()).not.toBe(0);
        expect(litSunSurface.map).toBe(borrowedTexture);
        const globalSprite = new THREE.Sprite();
        globalSprite.material.dispose();
        const globalDispose = vi.spyOn(globalSprite.geometry, "dispose");
        expect(spriteGeometries.size).toBe(1);
        spriteGeometries.forEach((value) => expect(value).not.toBe(globalSprite.geometry));
        effects.dispose();
        effects.dispose();
        spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
        expect(globalDispose).not.toHaveBeenCalled();
        expect(borrowedDispose).not.toHaveBeenCalled();
        originalReferences.forEach((surface, object) => expect(object.material).toBe(surface));
        const remaining = new Set<string>();
        scene.traverse((object) => remaining.add(object.uuid));
        expect(remaining).toEqual(original);
        expect(find(scene, (object) => object.userData.web_role === "sun").visible).toBe(true);
        vi.restoreAllMocks();
        borrowedTexture.dispose();
    });
});
