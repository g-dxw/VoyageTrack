<script module lang="ts">
    export type SearchItem = {
        text: string;
        description?: string;
        value: any;
        icon: string;
    };
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import { fade } from "svelte/transition";
    import SearchList from "./search_list.svelte";
    import TextField from "./text_field.svelte";
    import { _ } from "svelte-i18n";

    interface Props {
        maxSearchLength?: number;
        timeBetweenUpdates?: number,
        value?: string;
        items?: SearchItem[];
        placeholder?: string;
        large?: boolean;
        extraClasses?: string;
        label?: string;
        clearAfterSelect?: boolean;
        prepend?: Snippet<[any]>;
        onupdate?: (q: string) => void;
        onclick?: (item: SearchItem) => void;
    }

    let {
        maxSearchLength = 5,
        timeBetweenUpdates = 500,
        value = $bindable(""),
        items = $bindable([]),
        placeholder,
        large = false,
        extraClasses = "",
        label = "",
        clearAfterSelect = true,
        prepend,
        onupdate,
        onclick,
    }: Props = $props();

    const uid = $props.id();
    const inputId = `search-${uid}`;

    let lastSearch: string = "";
    let searching: boolean = $state(false);
    let typingTimer!: any;

    let dropDownOpen = $derived(
        value.length > 0 && items.length > 0 && searching,
    );

    function onSearchType() {
        clearTimeout(typingTimer);
        if (Math.abs(value.length - lastSearch.length) > maxSearchLength) {
            update(value);
            return;
        }
        typingTimer = setTimeout(() => {
            update(value);
        }, timeBetweenUpdates);
    }

    function update(q: string) {
        lastSearch = q;
        onupdate?.(q);
    }

    function handleItemClick(e: Event, item: SearchItem) {
        e.stopPropagation();
        searching = false;
        onclick?.(item);
        if (clearAfterSelect) {
            clear();
        }
    }

    function clear() {
        value = "";
        items = [];
        update(value);
    }
</script>

<div class="relative {extraClasses}">
    {#if label.length}
        <label for={inputId} class="block text-sm font-medium pb-1">
            {label}
        </label>
    {/if}
    <div class="relative {large ? 'w-full sm:min-w-80 sm:w-[33vw] max-w-[532px]' : ''}">
        <span
            aria-hidden="true"
            class="pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 {large ? 'w-12' : 'w-10'} flex justify-center"
        >
            <i class="fa fa-search" class:text-xl={large}></i>
        </span>
        <TextField
            id={inputId}
            type="search"
            name="q"
            autocomplete="off"
            extraClasses={large
                ? "px-12 text-xl min-h-[52px] sm:min-h-12 rounded-xl"
                : "pl-10 pr-12"}
            placeholder={placeholder ?? $_("search-placeholder")}
            bind:value
            oninput={onSearchType}
            onfocusin={() => (searching = true)}
            onfocusout={() => (searching = false)}
        ></TextField>
        {#if value.length > 0}
            <button
                aria-label={$_("clear")}
                type="button"
                class="btn-icon absolute top-1/2 -translate-y-1/2 right-0 sm:right-1"
                onclick={clear}
                in:fade={{ duration: 150 }}
                out:fade={{ duration: 150 }}
            >
                <i class="fa fa-close text-sm"></i>
            </button>
        {/if}

        {#if dropDownOpen}
            <SearchList {items} extraClasses="w-full" {prepend} onclick={handleItemClick}></SearchList>
        {/if}
    </div>
</div>
