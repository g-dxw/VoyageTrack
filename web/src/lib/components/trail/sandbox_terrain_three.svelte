<script lang="ts">
    import type { FeatureCollection, LineString, MultiLineString } from "geojson";
    import * as M from "maplibre-gl";
    import type { StyleSpecification } from "maplibre-gl";
    import { onDestroy, onMount, tick } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
    import type { SandboxBounds } from "$lib/util/sandbox_util";
    import type { Waypoint } from "$lib/models/waypoint";

    interface Props {
        map?: M.Map | null;
        theme?: string;
        onerror?: (error: Error) => void;
        styles?: Record<string, string | StyleSpecification>;
        selectedStyle?: string;
        onstylechange?: (style: string) => void;
        waypoints?: Waypoint[];
        showWaypoints?: boolean;
    }

    let {
        map = null,
        theme = "light",
        onerror,
        styles = {},
        selectedStyle = "",
        onstylechange,
        waypoints = [],
        showWaypoints = true,
    }: Props = $props();

    let container: HTMLDivElement;
    let loading = $state(false);
    let visible = $state(false);
    let stylePanelOpen = $state(false);
    let waypointsVisible = $state(true);
    let selectedWaypoint = $state<Waypoint | null>(null);
    let popupPosition = $state({ x: 0, y: 0 });
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let cameraFit: {
        target: THREE.Vector3;
        direction: THREE.Vector3;
        radius: number;
    } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;
    let generation = 0;

    const maximumGridSize = 96;
    const minimumGridSize = 48;

    onMount(() => {
        resizeObserver = new ResizeObserver(resizeRenderer);
        resizeObserver.observe(container);
    });

    $effect(() => {
        waypointsVisible = showWaypoints;
    });

    $effect(() => {
        if (scene) {
            scene.background = new THREE.Color(
                theme === "light" ? 0xd7dce2 : 0x111318,
            );
        }
    });

    export async function show(
        bounds: SandboxBounds,
        routeData?: FeatureCollection,
        routeLayerId?: string,
    ): Promise<boolean> {
        if (!map) {
            return false;
        }

        const currentGeneration = ++generation;
        visible = true;
        loading = true;
        await tick();

        try {
            initializeRenderer();
            await prepareMap(bounds);
            if (currentGeneration !== generation || !map) {
                return false;
            }

            const terrain = await sampleTerrain(bounds);
            if (currentGeneration !== generation) {
                return false;
            }

            const texture = await captureMapTexture(bounds, routeLayerId);
            buildScene(bounds, terrain, routeData, texture, waypoints);
            loading = false;
            startRendering();
            return true;
        } catch (error) {
            loading = false;
            visible = false;
            const normalizedError =
                error instanceof Error ? error : new Error(String(error));
            onerror?.(normalizedError);
            return false;
        }
    }

    export function hide() {
        generation += 1;
        loading = false;
        visible = false;
        stopRendering();
        disposeScene();
        stylePanelOpen = false;
        selectedWaypoint = null;
    }

    export function zoomIn() {
        controls?.dollyIn(1.25);
        controls?.update();
    }

    export function zoomOut() {
        controls?.dollyOut(1.25);
        controls?.update();
    }

    export function resetView() {
        applyCameraFit();
    }

    function toggleWaypoints() {
        waypointsVisible = !waypointsVisible;
        scene?.getObjectByName("sandbox-waypoints")?.traverse((object) => {
            object.visible = waypointsVisible;
        });
    }

    function handleCanvasClick(event: MouseEvent) {
        if (!renderer || !camera || !scene || !waypointsVisible) {
            return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const group = scene.getObjectByName("sandbox-waypoints");
        const hit = group
            ? raycaster.intersectObjects(group.children, true)[0]
            : undefined;
        selectedWaypoint = hit?.object.userData.waypoint ?? null;
    }

    function updatePopupPosition() {
        if (!selectedWaypoint || !camera || !renderer || !scene) {
            return;
        }
        const group = scene.getObjectByName("sandbox-waypoints");
        const marker = group?.children.find(
            (child) => child.userData.waypoint === selectedWaypoint,
        );
        if (!marker) {
            return;
        }
        const projected = marker.position.clone().project(camera);
        popupPosition = {
            x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
            y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight,
        };
    }

    function initializeRenderer() {
        if (renderer) {
            resizeRenderer();
            return;
        }

        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.className = "sandbox-three-canvas";
        renderer.domElement.addEventListener("click", handleCanvasClick);
        container.appendChild(renderer.domElement);
        resizeRenderer();
    }

    async function prepareMap(bounds: SandboxBounds) {
        if (!map) {
            return;
        }

        map.fitBounds(bounds, {
            padding: 0,
            pitch: 0,
            bearing: 0,
            maxZoom: 14,
            duration: 0,
        });
        map.triggerRepaint();
        await waitForMapIdle(3500);
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    }

    function waitForMapIdle(timeout: number) {
        if (!map || (map.loaded() && map.areTilesLoaded())) {
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                map?.off("idle", finish);
                resolve();
            };

            map.on("idle", finish);
            window.setTimeout(finish, timeout);
        });
    }

    async function sampleTerrain(bounds: SandboxBounds) {
        if (!map) {
            throw new Error("Map is not ready");
        }

        const [west, south, east, north] = bounds;
        const center = new M.LngLat((west + east) / 2, (south + north) / 2);
        const widthMeters = new M.LngLat(west, center.lat).distanceTo(
            new M.LngLat(east, center.lat),
        );
        const depthMeters = new M.LngLat(center.lng, south).distanceTo(
            new M.LngLat(center.lng, north),
        );
        const maximumDimension = Math.max(widthMeters, depthMeters);
        const columns = Math.max(
            minimumGridSize,
            Math.round((widthMeters / maximumDimension) * maximumGridSize),
        );
        const rows = Math.max(
            minimumGridSize,
            Math.round((depthMeters / maximumDimension) * maximumGridSize),
        );

        let elevations: Array<number | null> = [];
        for (let attempt = 0; attempt < 4; attempt += 1) {
            elevations = [];
            for (let row = 0; row < rows; row += 1) {
                const latitude = north - (row / (rows - 1)) * (north - south);
                for (let column = 0; column < columns; column += 1) {
                    const longitude =
                        west + (column / (columns - 1)) * (east - west);
                    const elevation = map.queryTerrainElevation([
                        longitude,
                        latitude,
                    ]);
                    elevations.push(
                        elevation !== null && Number.isFinite(elevation)
                            ? elevation
                            : null,
                    );
                }
            }

            const coverage =
                elevations.filter((elevation) => elevation !== null).length /
                elevations.length;
            if (coverage >= 0.85 || attempt === 3) {
                break;
            }

            map.triggerRepaint();
            await new Promise((resolve) => window.setTimeout(resolve, 450));
        }

        const validElevations = elevations.filter(
            (elevation): elevation is number => elevation !== null,
        );
        if (!validElevations.length) {
            throw new Error("Terrain elevation data is unavailable for this area");
        }

        const averageElevation =
            validElevations.reduce((sum, elevation) => sum + elevation, 0) /
            validElevations.length;

        return {
            columns,
            rows,
            widthMeters,
            depthMeters,
            elevations: elevations.map(
                (elevation) => elevation ?? averageElevation,
            ),
        };
    }

    async function captureMapTexture(
        bounds: SandboxBounds,
        routeLayerId?: string,
    ) {
        if (!map) {
            return null;
        }

        const hiddenLayers = [
            routeLayerId,
            "direction-carets",
            "hillshading",
        ].filter(
            (layerId): layerId is string => Boolean(layerId && map?.getLayer(layerId)),
        );
        const previousVisibility = new Map<string, string>();
        const previousTerrain = map.getTerrain();

        try {
            hiddenLayers.forEach((layerId) => {
                previousVisibility.set(
                    layerId,
                    (map?.getLayoutProperty(layerId, "visibility") as string) ??
                        "visible",
                );
                map?.setLayoutProperty(layerId, "visibility", "none");
            });
            if (previousTerrain) {
                map.setTerrain(null);
            }
            map.triggerRepaint();
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );

            const sourceCanvas = map.getCanvas();
            const northWest = map.project([bounds[0], bounds[3]]);
            const southEast = map.project([bounds[2], bounds[1]]);
            const left = Math.max(0, Math.min(northWest.x, southEast.x));
            const top = Math.max(0, Math.min(northWest.y, southEast.y));
            const right = Math.min(
                sourceCanvas.clientWidth,
                Math.max(northWest.x, southEast.x),
            );
            const bottom = Math.min(
                sourceCanvas.clientHeight,
                Math.max(northWest.y, southEast.y),
            );
            const scaleX = sourceCanvas.width / sourceCanvas.clientWidth;
            const scaleY = sourceCanvas.height / sourceCanvas.clientHeight;
            const sourceWidth = Math.max(1, (right - left) * scaleX);
            const sourceHeight = Math.max(1, (bottom - top) * scaleY);
            const textureCanvas = document.createElement("canvas");
            const maximumTextureSize = 1536;
            const textureScale = Math.min(
                1,
                maximumTextureSize / Math.max(sourceWidth, sourceHeight),
            );
            textureCanvas.width = Math.max(
                1,
                Math.round(sourceWidth * textureScale),
            );
            textureCanvas.height = Math.max(
                1,
                Math.round(sourceHeight * textureScale),
            );
            const context = textureCanvas.getContext("2d");
            if (!context) {
                return null;
            }

            context.drawImage(
                sourceCanvas,
                left * scaleX,
                top * scaleY,
                sourceWidth,
                sourceHeight,
                0,
                0,
                textureCanvas.width,
                textureCanvas.height,
            );

            const texture = new THREE.CanvasTexture(textureCanvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(
                8,
                renderer?.capabilities.getMaxAnisotropy() ?? 1,
            );
            return texture;
        } catch {
            return null;
        } finally {
            hiddenLayers.forEach((layerId) => {
                if (map?.getLayer(layerId)) {
                    map.setLayoutProperty(
                        layerId,
                        "visibility",
                        previousVisibility.get(layerId) ?? "visible",
                    );
                }
            });
            if (previousTerrain && map) {
                map.setTerrain(previousTerrain);
            }
            map?.triggerRepaint();
        }
    }

    function buildScene(
        bounds: SandboxBounds,
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
        routeData: FeatureCollection | undefined,
        texture: THREE.Texture | null,
        waypoints: Waypoint[],
    ) {
        disposeScene();

        const nextScene = new THREE.Scene();
        nextScene.background = new THREE.Color(
            theme === "light" ? 0xd7dce2 : 0x111318,
        );

        const minimumElevation = Math.min(...terrain.elevations);
        const maximumElevation = Math.max(...terrain.elevations);
        const relief = maximumElevation - minimumElevation;
        const diagonal = Math.hypot(
            terrain.widthMeters,
            terrain.depthMeters,
        );
        const baseThickness = Math.max(
            30,
            Math.min(500, Math.max(diagonal * 0.025, relief * 0.15)),
        );
        const exaggeration = 1.25;
        const topGeometry = createTopGeometry(
            terrain,
            minimumElevation,
            baseThickness,
            exaggeration,
        );
        const topMaterial = texture
            ? new THREE.MeshBasicMaterial({ map: texture })
            : new THREE.MeshStandardMaterial({
                  vertexColors: true,
                  color: 0x78966d,
                  roughness: 0.92,
                  metalness: 0,
              });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        topMesh.receiveShadow = true;
        topMesh.castShadow = true;
        nextScene.add(topMesh);

        const sideGeometry = createSideGeometry(
            terrain,
            minimumElevation,
            baseThickness,
            exaggeration,
        );
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: theme === "light" ? 0x5f6873 : 0x24282f,
            roughness: 0.86,
            metalness: 0.02,
            side: THREE.DoubleSide,
        });
        const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);
        sideMesh.castShadow = true;
        sideMesh.receiveShadow = true;
        nextScene.add(sideMesh);

        const bottomGeometry = new THREE.PlaneGeometry(
            terrain.widthMeters,
            terrain.depthMeters,
        );
        bottomGeometry.rotateX(-Math.PI / 2);
        const bottomMesh = new THREE.Mesh(bottomGeometry, sideMaterial);
        bottomMesh.receiveShadow = true;
        nextScene.add(bottomMesh);

        if (routeData) {
            addRoute(
                nextScene,
                bounds,
                routeData,
                terrain,
                minimumElevation,
                baseThickness,
                exaggeration,
            );
        }

        addWaypoints(
            nextScene,
            bounds,
            terrain,
            minimumElevation,
            baseThickness,
            exaggeration,
            waypoints,
        );

        const hemisphere = new THREE.HemisphereLight(0xffffff, 0x38404a, 1.8);
        nextScene.add(hemisphere);

        const directional = new THREE.DirectionalLight(0xffffff, 2.4);
        const maximumDimension = Math.max(
            terrain.widthMeters,
            terrain.depthMeters,
        );
        directional.position.set(
            -maximumDimension * 0.45,
            maximumDimension * 1.1,
            maximumDimension * 0.55,
        );
        directional.castShadow = true;
        directional.shadow.mapSize.set(2048, 2048);
        nextScene.add(directional);

        const nextCamera = new THREE.PerspectiveCamera(
            38,
            Math.max(1, container.clientWidth) /
                Math.max(1, container.clientHeight),
            Math.max(0.5, maximumDimension / 5000),
            maximumDimension * 12,
        );
        const targetHeight = baseThickness + relief * exaggeration * 0.28;
        const modelRadius = Math.hypot(
            terrain.widthMeters / 2,
            terrain.depthMeters / 2,
            (baseThickness + relief * exaggeration) / 2,
        );
        const cameraTarget = new THREE.Vector3(0, targetHeight, 0);
        const cameraDirection = new THREE.Vector3(0.78, 0.7, 1).normalize();

        if (!renderer) {
            return;
        }
        const nextControls = new OrbitControls(
            nextCamera,
            renderer.domElement,
        );
        nextControls.target.copy(cameraTarget);
        nextControls.enableDamping = true;
        nextControls.dampingFactor = 0.08;
        nextControls.minDistance = maximumDimension * 0.35;
        nextControls.maxDistance = maximumDimension * 3;
        nextControls.maxPolarAngle = Math.PI * 0.49;

        scene = nextScene;
        camera = nextCamera;
        controls = nextControls;
        cameraFit = {
            target: cameraTarget,
            direction: cameraDirection,
            radius: modelRadius,
        };
        resizeRenderer();
    }

    function addWaypoints(
        targetScene: THREE.Scene,
        bounds: SandboxBounds,
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
        minimumElevation: number,
        baseThickness: number,
        exaggeration: number,
        waypoints: Waypoint[],
    ) {
        if (!waypoints.length) {
            return;
        }

        const group = new THREE.Group();
        group.name = "sandbox-waypoints";
        group.visible = waypointsVisible;
        const material = new THREE.MeshStandardMaterial({
            color: 0xf7c948,
            emissive: 0x5b4300,
            emissiveIntensity: 0.45,
            roughness: 0.45,
        });
        const radius = Math.max(3, Math.max(terrain.widthMeters, terrain.depthMeters) * 0.004);
        waypoints.forEach((waypoint) => {
            const elevation = interpolateTerrainElevation(
                waypoint.lon,
                waypoint.lat,
                bounds,
                terrain,
            );
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 16, 12),
                material,
            );
            marker.position.set(
                -terrain.widthMeters / 2 +
                    ((waypoint.lon - bounds[0]) / (bounds[2] - bounds[0])) *
                        terrain.widthMeters,
                baseThickness +
                    (elevation - minimumElevation) * exaggeration +
                    radius * 1.8,
                -terrain.depthMeters / 2 +
                    ((bounds[3] - waypoint.lat) / (bounds[3] - bounds[1])) *
                        terrain.depthMeters,
            );
            marker.userData.waypoint = waypoint;
            marker.castShadow = true;
            marker.receiveShadow = true;
            group.add(marker);
        });
        targetScene.add(group);
    }

    function createTopGeometry(
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
        minimumElevation: number,
        baseThickness: number,
        exaggeration: number,
    ) {
        const positions: number[] = [];
        const colors: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const maximumElevation = Math.max(...terrain.elevations);
        const relief = Math.max(1, maximumElevation - minimumElevation);

        for (let row = 0; row < terrain.rows; row += 1) {
            for (let column = 0; column < terrain.columns; column += 1) {
                const index = row * terrain.columns + column;
                const normalizedElevation =
                    (terrain.elevations[index] - minimumElevation) / relief;
                positions.push(
                    -terrain.widthMeters / 2 +
                        (column / (terrain.columns - 1)) * terrain.widthMeters,
                    baseThickness +
                        (terrain.elevations[index] - minimumElevation) *
                            exaggeration,
                    -terrain.depthMeters / 2 +
                        (row / (terrain.rows - 1)) * terrain.depthMeters,
                );

                const color = new THREE.Color().setHSL(
                    0.31 - normalizedElevation * 0.2,
                    0.28,
                    0.36 + normalizedElevation * 0.34,
                );
                colors.push(color.r, color.g, color.b);
                uvs.push(
                    column / (terrain.columns - 1),
                    1 - row / (terrain.rows - 1),
                );
            }
        }

        for (let row = 0; row < terrain.rows - 1; row += 1) {
            for (let column = 0; column < terrain.columns - 1; column += 1) {
                const a = row * terrain.columns + column;
                const b = a + 1;
                const c = a + terrain.columns;
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3),
        );
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    }

    function createSideGeometry(
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
        minimumElevation: number,
        baseThickness: number,
        exaggeration: number,
    ) {
        const perimeter: number[] = [];

        for (let column = 0; column < terrain.columns; column += 1) {
            perimeter.push(column);
        }
        for (let row = 1; row < terrain.rows; row += 1) {
            perimeter.push(row * terrain.columns + terrain.columns - 1);
        }
        for (let column = terrain.columns - 2; column >= 0; column -= 1) {
            perimeter.push((terrain.rows - 1) * terrain.columns + column);
        }
        for (let row = terrain.rows - 2; row > 0; row -= 1) {
            perimeter.push(row * terrain.columns);
        }

        const positions: number[] = [];
        const indices: number[] = [];
        const pointForIndex = (index: number) => {
            const row = Math.floor(index / terrain.columns);
            const column = index % terrain.columns;
            return {
                x:
                    -terrain.widthMeters / 2 +
                    (column / (terrain.columns - 1)) * terrain.widthMeters,
                y:
                    baseThickness +
                    (terrain.elevations[index] - minimumElevation) *
                        exaggeration,
                z:
                    -terrain.depthMeters / 2 +
                    (row / (terrain.rows - 1)) * terrain.depthMeters,
            };
        };

        perimeter.forEach((index, perimeterIndex) => {
            const nextIndex = perimeter[(perimeterIndex + 1) % perimeter.length];
            const start = pointForIndex(index);
            const end = pointForIndex(nextIndex);
            const offset = positions.length / 3;
            positions.push(
                start.x,
                start.y,
                start.z,
                end.x,
                end.y,
                end.z,
                end.x,
                0,
                end.z,
                start.x,
                0,
                start.z,
            );
            indices.push(
                offset,
                offset + 1,
                offset + 2,
                offset,
                offset + 2,
                offset + 3,
            );
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    function addRoute(
        targetScene: THREE.Scene,
        bounds: SandboxBounds,
        routeData: FeatureCollection,
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
        minimumElevation: number,
        baseThickness: number,
        exaggeration: number,
    ) {
        const [west, south, east, north] = bounds;
        const lineFeatures = routeData.features.filter(
            (feature): feature is typeof feature & {
                geometry: LineString | MultiLineString;
            } =>
                feature.geometry?.type === "LineString" ||
                feature.geometry?.type === "MultiLineString",
        );
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0x3549bb,
            emissive: 0x111b68,
            emissiveIntensity: 0.35,
            roughness: 0.6,
        });
        const maximumDimension = Math.max(
            terrain.widthMeters,
            terrain.depthMeters,
        );

        lineFeatures.forEach((feature) => {
            const lines =
                feature.geometry.type === "LineString"
                    ? [feature.geometry.coordinates]
                    : feature.geometry.coordinates;

            lines.forEach((coordinates) => {
                const stride = Math.max(1, Math.ceil(coordinates.length / 500));
                const sampledCoordinates = coordinates.filter(
                    (_, index) =>
                        index % stride === 0 ||
                        index === coordinates.length - 1,
                );
                const points = sampledCoordinates.map((coordinate) => {
                    const longitude = coordinate[0];
                    const latitude = coordinate[1];
                    const elevation = interpolateTerrainElevation(
                        longitude,
                        latitude,
                        bounds,
                        terrain,
                    );
                    return new THREE.Vector3(
                        -terrain.widthMeters / 2 +
                            ((longitude - west) / (east - west)) *
                                terrain.widthMeters,
                        baseThickness +
                            (elevation - minimumElevation) * exaggeration +
                            maximumDimension * 0.0015,
                        -terrain.depthMeters / 2 +
                            ((north - latitude) / (north - south)) *
                                terrain.depthMeters,
                    );
                });

                if (points.length < 2) {
                    return;
                }

                const curve = new THREE.CatmullRomCurve3(
                    points,
                    false,
                    "centripetal",
                );
                const geometry = new THREE.TubeGeometry(
                    curve,
                    Math.max(32, points.length - 1),
                    Math.max(2.5, maximumDimension * 0.0012),
                    5,
                    false,
                );
                const mesh = new THREE.Mesh(geometry, lineMaterial);
                mesh.castShadow = true;
                targetScene.add(mesh);
            });
        });
    }

    function interpolateTerrainElevation(
        longitude: number,
        latitude: number,
        bounds: SandboxBounds,
        terrain: Awaited<ReturnType<typeof sampleTerrain>>,
    ) {
        const [west, south, east, north] = bounds;
        const longitudeRatio = THREE.MathUtils.clamp(
            (longitude - west) / (east - west),
            0,
            1,
        );
        const latitudeRatio = THREE.MathUtils.clamp(
            (north - latitude) / (north - south),
            0,
            1,
        );
        const column = longitudeRatio * (terrain.columns - 1);
        const row = latitudeRatio * (terrain.rows - 1);
        const left = Math.floor(column);
        const right = Math.min(terrain.columns - 1, left + 1);
        const top = Math.floor(row);
        const bottom = Math.min(terrain.rows - 1, top + 1);
        const columnWeight = column - left;
        const rowWeight = row - top;
        const elevationAt = (sampleRow: number, sampleColumn: number) =>
            terrain.elevations[sampleRow * terrain.columns + sampleColumn];
        const topElevation =
            elevationAt(top, left) * (1 - columnWeight) +
            elevationAt(top, right) * columnWeight;
        const bottomElevation =
            elevationAt(bottom, left) * (1 - columnWeight) +
            elevationAt(bottom, right) * columnWeight;
        return topElevation * (1 - rowWeight) + bottomElevation * rowWeight;
    }

    function resizeRenderer() {
        if (!renderer || !container) {
            return;
        }

        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);
        if (camera) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            applyCameraFit();
        }
    }

    function applyCameraFit() {
        if (!camera || !cameraFit) {
            return;
        }

        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov =
            2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
        const limitingFov = Math.min(verticalFov, horizontalFov);
        const cameraDistance =
            (cameraFit.radius / Math.sin(limitingFov / 2)) * 1.18;
        camera.position.copy(
            cameraFit.target
                .clone()
                .add(cameraFit.direction.clone().multiplyScalar(cameraDistance)),
        );
        if (controls) {
            controls.maxDistance = Math.max(
                controls.maxDistance,
                cameraDistance * 1.5,
            );
        }
        controls?.target.copy(cameraFit.target);
        controls?.update();
    }

    function startRendering() {
        stopRendering();
        const render = () => {
            if (!visible || !renderer || !scene || !camera) {
                return;
            }
            controls?.update();
            renderer.render(scene, camera);
            updatePopupPosition();
            animationFrame = requestAnimationFrame(render);
        };
        render();
    }

    function stopRendering() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }
    }

    function disposeScene() {
        controls?.dispose();
        controls = null;
        if (scene) {
            scene.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) {
                    return;
                }
                object.geometry.dispose();
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];
                materials.forEach((material) => {
                    if (
                        material instanceof THREE.MeshStandardMaterial ||
                        material instanceof THREE.MeshBasicMaterial
                    ) {
                        material.map?.dispose();
                    }
                    material.dispose();
                });
            });
        }
        scene = null;
        camera = null;
        cameraFit = null;
    }

    onDestroy(() => {
        generation += 1;
        stopRendering();
        resizeObserver?.disconnect();
        disposeScene();
        renderer?.dispose();
        renderer?.domElement.removeEventListener("click", handleCanvasClick);
        renderer?.domElement.remove();
        renderer = null;
    });
</script>

<div
    bind:this={container}
    class:visible
    class="sandbox-three"
    aria-hidden={!visible}
>
    {#if visible && !loading}
        <div class="sandbox-controls" aria-label="Sandbox controls">
            <button
                type="button"
                class:active={stylePanelOpen}
                aria-label="Sandbox map style"
                title="Sandbox map style"
                aria-expanded={stylePanelOpen}
                onclick={() => (stylePanelOpen = !stylePanelOpen)}
            >
                <i class="fa fa-layer-group" aria-hidden="true"></i>
            </button>
            {#if waypoints.length}
                <button
                    type="button"
                    class:active={waypointsVisible}
                    aria-label={waypointsVisible ? "Hide points" : "Show points"}
                    title={waypointsVisible ? "Hide points" : "Show points"}
                    aria-pressed={waypointsVisible}
                    onclick={toggleWaypoints}
                >
                    <i class="fa fa-map-marker-alt" aria-hidden="true"></i>
                </button>
            {/if}
            <button type="button" aria-label="Zoom in" title="Zoom in" onclick={zoomIn}>
                <i class="fa fa-plus" aria-hidden="true"></i>
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onclick={zoomOut}>
                <i class="fa fa-minus" aria-hidden="true"></i>
            </button>
            <button type="button" aria-label="Reset sandbox view" title="Reset sandbox view" onclick={resetView}>
                <i class="fa fa-compass" aria-hidden="true"></i>
            </button>
        </div>
        {#if stylePanelOpen}
            <div class="sandbox-style-panel" role="radiogroup" aria-label="Sandbox map style">
                <div class="sandbox-style-header">地图样式</div>
                {#each Object.keys(styles) as style}
                    <button
                        type="button"
                        class:selected={style === selectedStyle}
                        role="radio"
                        aria-checked={style === selectedStyle}
                        onclick={() => {
                            onstylechange?.(style);
                            stylePanelOpen = false;
                        }}
                    >
                        <span class="sandbox-radio" aria-hidden="true"></span>
                        {style}
                    </button>
                {/each}
            </div>
        {/if}
        {#if selectedWaypoint}
            <div class="sandbox-waypoint-popup" style={`left: ${popupPosition.x}px; top: ${popupPosition.y}px`}>
                <button type="button" class="sandbox-popup-close" aria-label="Close point details" onclick={() => (selectedWaypoint = null)}>
                    <i class="fa fa-close" aria-hidden="true"></i>
                </button>
                <div class="sandbox-popup-title">
                    <i class="fa fa-map-marker-alt" aria-hidden="true"></i>
                    {selectedWaypoint.name || "打卡点"}
                </div>
                {#if selectedWaypoint.description}
                    <div class="sandbox-popup-description">{@html selectedWaypoint.description}</div>
                {/if}
                <div class="sandbox-popup-coordinates">
                    {selectedWaypoint.lat.toFixed(5)}, {selectedWaypoint.lon.toFixed(5)}
                </div>
            </div>
        {/if}
    {/if}
    {#if loading}
        <div class="sandbox-loading" role="status" aria-label="Loading 3D sandbox">
            <i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
        </div>
    {/if}
</div>

<style>
    .sandbox-three {
        position: absolute;
        inset: 0;
        z-index: 1;
        visibility: hidden;
        pointer-events: none;
        overflow: hidden;
    }

    .sandbox-three.visible {
        visibility: visible;
        pointer-events: auto;
    }

    .sandbox-loading {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: grid;
        place-items: center;
        color: #59616c;
        background: rgba(215, 220, 226, 0.86);
        font-size: 1.75rem;
    }

    .sandbox-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 3;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgb(0 0 0 / 0.14);
        border-radius: 6px;
        background: rgb(255 255 255 / 0.94);
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
        backdrop-filter: blur(6px);
    }

    .sandbox-controls button {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border: 0;
        background: transparent;
        color: #374151;
        cursor: pointer;
        font-size: 16px;
    }

    .sandbox-controls button + button {
        border-top: 1px solid rgb(0 0 0 / 0.1);
    }

    .sandbox-controls button:hover,
    .sandbox-controls button:focus-visible {
        background: rgb(53 73 187 / 0.12);
    }

    .sandbox-controls button.active {
        background: rgb(53 73 187 / 0.16);
        color: #3549bb;
    }

    .sandbox-style-panel {
        position: absolute;
        top: 12px;
        right: 64px;
        z-index: 3;
        display: flex;
        width: min(240px, calc(100% - 88px));
        max-height: min(420px, calc(100% - 24px));
        flex-direction: column;
        overflow-y: auto;
        padding: 12px;
        border: 1px solid rgb(0 0 0 / 0.14);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.96);
        box-shadow: 0 2px 10px rgb(0 0 0 / 0.2);
        backdrop-filter: blur(6px);
    }

    .sandbox-style-header {
        padding: 2px 4px 8px;
        color: #111827;
        font-size: 15px;
        font-weight: 600;
    }

    .sandbox-style-panel button {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 4px;
        border: 0;
        background: transparent;
        color: #374151;
        text-align: left;
        cursor: pointer;
        font-size: 14px;
    }

    .sandbox-style-panel button:hover,
    .sandbox-style-panel button:focus-visible {
        background: rgb(53 73 187 / 0.1);
    }

    .sandbox-style-panel button.selected {
        color: #3549bb;
        font-weight: 600;
    }

    .sandbox-radio {
        width: 16px;
        height: 16px;
        flex: 0 0 16px;
        border: 2px solid currentColor;
        border-radius: 50%;
    }

    .sandbox-style-panel button.selected .sandbox-radio {
        box-shadow: inset 0 0 0 3px white;
        background: currentColor;
    }

    .sandbox-controls button:focus-visible {
        outline: 2px solid #3549bb;
        outline-offset: -2px;
    }

    :global(.dark) .sandbox-controls {
        border-color: rgb(255 255 255 / 0.16);
        background: rgb(31 35 45 / 0.94);
    }

    :global(.dark) .sandbox-controls button {
        color: #e5e7eb;
    }

    :global(.dark) .sandbox-controls button.active,
    :global(.dark) .sandbox-style-panel button.selected {
        color: #9aa8ff;
    }

    :global(.dark) .sandbox-style-panel {
        border-color: rgb(255 255 255 / 0.16);
        background: rgb(31 35 45 / 0.96);
    }

    :global(.dark) .sandbox-style-header,
    :global(.dark) .sandbox-style-panel button {
        color: #e5e7eb;
    }

    :global(.dark) .sandbox-loading {
        color: #d6dae0;
        background: rgba(17, 19, 24, 0.86);
    }

    :global(.sandbox-three-canvas) {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
    }

    .sandbox-waypoint-popup {
        position: absolute;
        z-index: 4;
        width: min(280px, calc(100% - 24px));
        padding: 12px 14px;
        transform: translate(-50%, calc(-100% - 18px));
        border: 1px solid rgb(0 0 0 / 0.14);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.97);
        box-shadow: 0 4px 14px rgb(0 0 0 / 0.24);
        color: #374151;
        pointer-events: auto;
    }

    .sandbox-popup-close {
        position: absolute;
        top: 6px;
        right: 6px;
        border: 0;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
    }

    .sandbox-popup-title {
        padding-right: 18px;
        color: #111827;
        font-size: 15px;
        font-weight: 600;
    }

    .sandbox-popup-description {
        max-height: 300px;
        margin-top: 8px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.45;
    }

    .sandbox-popup-coordinates {
        margin-top: 8px;
        color: #6b7280;
        font-size: 12px;
    }

    :global(.dark) .sandbox-waypoint-popup {
        border-color: rgb(255 255 255 / 0.16);
        background: rgb(31 35 45 / 0.97);
        color: #e5e7eb;
    }

    :global(.dark) .sandbox-popup-title {
        color: #f3f4f6;
    }
</style>
