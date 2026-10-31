<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import { theme } from "$lib/stores/theme_store";
    import type { IslandController, IslandSnapshot } from "./floating_island";

    let stage: HTMLDivElement;
    let controller = $state.raw<IslandController | undefined>();
    let snapshot = $state<IslandSnapshot>({ state: "fallback", paused: false });

    $effect(() => { controller?.setDarkMode($theme === "dark"); });

    onMount(() => {
        const desktop = window.matchMedia("(min-width: 64rem)");
        let generation = 0;
        let mounted = true;
        async function syncViewport() {
            const current = ++generation;
            controller?.destroy();
            controller = undefined;
            snapshot = { state: "fallback", paused: false };
            if (!desktop.matches) return;
            try {
                const { createFloatingIsland } = await import("./floating_island");
                if (!mounted || current !== generation || !desktop.matches) return;
                controller = createFloatingIsland(stage, {
                    dark: $theme === "dark",
                    onChange: (next) => { if (mounted && current === generation) snapshot = next; },
                });
            } catch (error) {
                if (mounted && current === generation) snapshot = { state: "fallback", paused: false };
                console.warn("The homepage landscape is unavailable.", error);
            }
        }
        desktop.addEventListener("change", syncViewport);
        void syncViewport();
        return () => {
            mounted = false;
            generation++;
            desktop.removeEventListener("change", syncViewport);
            controller?.destroy();
        };
    });
</script>

<div class="island-backdrop hidden lg:block" aria-hidden="false">
    <div
        class="island-stage"
        bind:this={stage}
        role="img"
        aria-label={$_("home-island-description")}
        data-testid="home-floating-island"
        data-scene-state={snapshot.state}
        data-motion={snapshot.paused ? "paused" : "playing"}
    >
        <img
            class="island-sky"
            src="/models/island-cloud-background.webp"
            width="1402"
            height="1122"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
        />
        <img
            class="island-poster island-poster-day"
            src="/models/floating-island-poster.webp"
            width="768"
            height="770"
            alt=""
            loading="lazy"
            decoding="async"
        />
        <img
            class="island-poster island-poster-night"
            src="/models/floating-island-night-poster.webp"
            width="768"
            height="770"
            alt=""
            loading="lazy"
            decoding="async"
        />
    </div>
</div>

<style>
    .island-backdrop {
        position: relative;
        isolation: isolate;
        z-index: 0;
        width: 100%;
        min-width: 0;
        height: clamp(30rem, 42vw, 35rem);
    }
    .island-stage {
        position: relative;
        isolation: isolate;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto;
    }
    .island-sky {
        position: absolute;
        inset: 0;
        z-index: -1;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
        -webkit-mask-image: radial-gradient(ellipse closest-side at 52% 48%, #000 60%, transparent 100%);
        mask-image: radial-gradient(ellipse closest-side at 52% 48%, #000 60%, transparent 100%);
    }
    :global(.dark) .island-sky {
        filter: brightness(.3) sepia(1) saturate(1.5) hue-rotate(165deg);
        opacity: .7;
    }
    .island-poster, .island-stage :global(canvas) {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .island-poster { pointer-events: none; }
    .island-stage :global(canvas) { opacity: 0; pointer-events: auto; }
    .island-poster-night { display: none; }
    :global(.dark) .island-poster-day { display: none; }
    :global(.dark) .island-poster-night { display: block; }
    .island-stage[data-scene-state="ready"] :global(canvas) { opacity: 1; }
    .island-stage[data-scene-state="ready"] .island-poster { opacity: 0; visibility: hidden; }
</style>
