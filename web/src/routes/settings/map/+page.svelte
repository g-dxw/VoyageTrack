<script lang="ts">
    import { page } from "$app/state";
    import Search, {
        type SearchItem,
    } from "$lib/components/base/search.svelte";
    import Select, {
        type SelectItem,
    } from "$lib/components/base/select.svelte";

    import Slider from "$lib/components/base/slider.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import {
        searchLocations,
        type LocationSearchResult,
    } from "$lib/stores/search_store";
    import { settings_update } from "$lib/stores/settings_store";
    import { currentUser } from "$lib/stores/user_store";
    import { getIconForLocation } from "$lib/util/icon_util";
    import { onMount, untrack } from "svelte";
    import { _ } from "svelte-i18n";
    import Toggle from "$lib/components/base/toggle.svelte";
    import { show_toast } from "$lib/stores/toast_store.svelte.js";

    let settings = $derived(page.data.settings);

    let allowAutoGeolocate = $state(
        page.data.settings.behavior?.allowAutoGeolocate ?? false,
    );
    let mapClusteringMaxZoom = $state(
        page.data.settings.behavior?.mapClusteringMaxZoom ?? 11,
    );
    let showTrailStartMarker = $state(
        page.data.settings.behavior?.showTrailStartMarker ?? false,
    );

    $effect(() => {
        const b = page.data.settings?.behavior;
        if (b) {
            untrack(() => {
                allowAutoGeolocate = b.allowAutoGeolocate ?? false;
                mapClusteringMaxZoom = b.mapClusteringMaxZoom ?? 11;
                showTrailStartMarker = b.showTrailStartMarker ?? false;
            });
        }
    });

    async function handleBehaviorChange() {
        if (!settings) {
            return;
        }

        try {
            const updatedSettings = {
                ...settings,
                behavior: {
                    allowAutoGeolocate: allowAutoGeolocate,
                    mapClusteringMaxZoom: Number(mapClusteringMaxZoom),
                    showTrailStartMarker: showTrailStartMarker,
                },
            };

            await settings_update(updatedSettings);
        } catch (e) {
            show_toast({
                type: "error",
                icon: "close",
                text: $_("error-saving-settings"),
            });
            console.error(e);
        }
    }

    const mapFocus: SelectItem[] = $derived([
        { text: $_("trail", { values: { n: 2 } }), value: "trails" },
        { text: $_("location"), value: "location" },
    ]);

    let selectedLanguage = "en";
    let selectedMapFocus = $state("trails");

    let searchDropdownItems: SearchItem[] = $state([]);
    let citySearchQuery: string = $state("");

    let customTilesetName: string = $state("");
    let customTilesetURL: string = $state("");
    let tiandituKey: string = $state("");
    let terrainURL: string = $state("");
    let hillshadingURL: string = $state("");

    onMount(() => {
        citySearchQuery = settings?.location?.name ?? "";
        selectedLanguage = settings?.language || "en";
        selectedMapFocus = settings?.mapFocus ?? "trails";

        tiandituKey = settings?.tiandituKey ?? "";
        terrainURL = settings?.terrain?.terrain ?? "";
        hillshadingURL = settings?.terrain?.hillshading ?? "";
    });

    async function searchCities(q: string) {
        const r = await searchLocations(q, 5);

        searchDropdownItems = r.map((h: LocationSearchResult) => ({
            text: h.name,
            description: h.description,
            value: h,
            icon: getIconForLocation(h),
        }));
    }

    async function handleSearchClick(item: SearchItem) {
        citySearchQuery = item.text;
        await settings_update({
            id: settings?.id!,
            location: {
                name: item.value.name,
                lat: item.value.lat,
                lon: item.value.lon,
            },
        });
    }

    async function handleMapFocusSelection(value: "trails" | "location") {
        await settings_update({
            id: settings!.id,
            mapFocus: value,
        });
    }

    async function handleTilesetAdd() {
        if (!customTilesetName || !customTilesetURL) {
            return;
        }
        await settings_update({
            id: settings!.id,
            tilesets: [
                ...(settings.tilesets ?? []),
                { name: customTilesetName, url: customTilesetURL },
            ],
        });
        customTilesetName = "";
        customTilesetURL = "";
    }

    async function handleTilesetDelete(index: number) {
        settings.tilesets.splice(index, 1);
        await settings_update({
            id: settings!.id,
            tilesets: settings.tilesets,
        });
    }

    async function handleTiandituKeySave() {
        if (!settings) {
            return;
        }

        try {
            await settings_update({
                id: settings.id,
                tiandituKey: tiandituKey.trim() || null,
            });
            show_toast({
                type: "success",
                icon: "check",
                text: $_("settings-saved"),
            });
        } catch (e) {
            show_toast({
                type: "error",
                icon: "close",
                text: $_("error-updating-tianditu-api-key"),
            });
            console.error(e);
        }
    }

    async function handleTerrainAdd() {
        await settings_update({
            id: settings!.id,
            terrain: { terrain: terrainURL, hillshading: hillshadingURL },
        });
    }

    let terrainSaveEnabled = $derived(
        terrainURL !== settings?.terrain?.terrain ||
            hillshadingURL !== settings?.terrain?.hillshading,
    );
    let tiandituKeySaveEnabled = $derived(
        tiandituKey !== (settings?.tiandituKey ?? ""),
    );
</script>

<svelte:head>
    <title>{$_("settings")} | wanderer</title>
</svelte:head>
<h2 class="text-2xl font-semibold">{$_("map")}</h2>
<hr class="mt-3 mb-4 border-input-border" />
{#if $currentUser}
    <div class="space-y-6 md:space-y-8">
        <div>
            <h4 class="text-xl font-medium mb-2">{$_("focus-map-on")}</h4>
            <Select
                items={mapFocus}
                bind:value={selectedMapFocus}
                onchange={handleMapFocusSelection}
            ></Select>
            {#if selectedMapFocus == "location"}
                <div class="mt-3">
                    <Search
                        items={searchDropdownItems}
                        placeholder="{$_('search-for-trails-places')}..."
                        clearAfterSelect={false}
                        bind:value={citySearchQuery}
                        onupdate={searchCities}
                        onclick={handleSearchClick}
                    ></Search>
                </div>
            {/if}
            <div class="mt-5 space-y-3">
                <div
                    class="grid gap-2 sm:gap-4 items-center grid-cols-[minmax(0,1fr)_max-content]"
                >
                    <p>{$_("allow-auto-geolocate")}</p>
                    <div>
                        <Toggle
                            bind:value={allowAutoGeolocate}
                            onchange={handleBehaviorChange}
                        ></Toggle>
                    </div>
                </div>
                <div
                    class="grid gap-2 sm:gap-4 items-center sm:grid-cols-[minmax(0,1fr)_max-content]"
                >
                    <p>{$_("map-trail-preview-zoom-level")}</p>
                    <div class="flex items-center gap-3 w-full sm:w-56">
                        <span class="w-8 text-right tabular-nums">
                            {Math.round(Number(mapClusteringMaxZoom))}
                        </span>
                        <div class="flex-1 min-w-0">
                            <Slider
                                minValue={0}
                                maxValue={22}
                                step={1}
                                bind:currentValue={mapClusteringMaxZoom}
                                onset={handleBehaviorChange}
                            ></Slider>
                        </div>
                    </div>
                </div>
                <div
                    class="grid gap-2 sm:gap-4 items-center grid-cols-[minmax(0,1fr)_max-content]"
                >
                    <p>{$_("show-trail-start-marker")}</p>
                    <div>
                        <Toggle
                            bind:value={showTrailStartMarker}
                            onchange={handleBehaviorChange}
                        ></Toggle>
                    </div>
                </div>
            </div>
        </div>
        <div>
            <h4 class="text-xl font-medium mb-2">{$_("tilesets")}</h4>

            {#each settings.tilesets ?? [] as tileset, i}
                <div
                    class="flex items-center justify-between px-4 py-2 border border-input-border rounded-xl mb-2"
                >
                    <div class="min-w-0">
                        <p>{tileset.name}</p>
                        <p class="text-sm text-gray-500 break-all">{tileset.url}</p>
                    </div>
                    <button
                        aria-label={$_("delete-tileset")}
                        class="btn-icon"
                        onclick={() => handleTilesetDelete(i)}
                        ><i class="fa fa-trash text-red-500"></i></button
                    >
                </div>
            {/each}
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-end">
                <div class="min-w-0">
                    <TextField
                        label={$_("name")}
                        bind:value={customTilesetName}
                        placeholder={$_("name")}
                    ></TextField>
                </div>
                <div class="flex items-end min-w-0 gap-2">
                    <div class="flex-1 min-w-0">
                        <TextField
                            label={$_("url")}
                            bind:value={customTilesetURL}
                            placeholder="https://.../style.json"
                        ></TextField>
                    </div>
                    <button
                        aria-label={$_("add-tileset")}
                        class="btn-icon shrink-0"
                        onclick={handleTilesetAdd}
                        ><i class="fa fa-plus"></i></button
                    >
                </div>
            </div>
        </div>

        <div>
            <h4 class="text-xl font-medium mb-2">{$_("tianditu")}</h4>
            <div class="flex items-end gap-2">
                <div class="flex-1 min-w-0">
                    <TextField
                        name="tianditu-key"
                        label={$_("tianditu-api-key")}
                        type="password"
                        autocomplete="off"
                        bind:value={tiandituKey}
                        placeholder={$_("tianditu-api-key-placeholder")}
                    ></TextField>
                </div>
                <button
                    aria-label={$_("save-tianditu-api-key")}
                    disabled={!tiandituKeySaveEnabled}
                    class="btn-icon shrink-0"
                    class:hover:!bg-background={!tiandituKeySaveEnabled}
                    onclick={handleTiandituKeySave}
                    class:text-gray-500={!tiandituKeySaveEnabled}
                    ><i class="fa fa-save"></i></button
                >
            </div>
        </div>

        <div>
            <h4 class="text-xl font-medium mb-2">{$_("terrain")}</h4>
            <div class="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
                <div class="col-span-2 sm:col-span-1 min-w-0">
                    <TextField
                        label={$_("terrain-url")}
                        bind:value={terrainURL}
                        placeholder="https://.../tiles.json"
                    ></TextField>
                </div>
                <div class="min-w-0">
                    <TextField
                        label={$_("hillshading-url")}
                        bind:value={hillshadingURL}
                        placeholder="https://.../tiles.json"
                    ></TextField>
                </div>
                <button
                    aria-label={$_("save-terrain-settings")}
                    disabled={!terrainSaveEnabled}
                    class="btn-icon shrink-0"
                    class:hover:!bg-background={!terrainSaveEnabled}
                    onclick={handleTerrainAdd}
                    class:text-gray-500={!terrainSaveEnabled}
                    ><i class="fa fa-save"></i></button
                >
            </div>
        </div>
    </div>
{/if}
