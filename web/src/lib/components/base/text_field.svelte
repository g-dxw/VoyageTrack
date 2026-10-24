<script lang="ts">
    import { _ } from "svelte-i18n";
    import { translateValidationError } from "$lib/util/validation_i18n";
    import type { ChangeEventHandler, FocusEventHandler, FormEventHandler } from "svelte/elements";

    interface Props {
        id?: string;
        name?: string;
        value?: string | number;
        placeholder?: string;
        disabled?: boolean;
        label?: string;
        error?: string | string[] | null;
        icon?: string;
        extraClasses?: string;
        type?: "text" | "password" | "search" | "url";
        autocomplete?: "on" | "off";
        onchange?: ChangeEventHandler<HTMLInputElement>;
        oninput?: FormEventHandler<HTMLInputElement>;
        onfocusin?: FocusEventHandler<HTMLInputElement>;
        onfocusout?: FocusEventHandler<HTMLInputElement>;
    }

    let {
        id,
        name = "",
        value = $bindable(""),
        placeholder = "",
        disabled = false,
        label = "",
        error = "",
        icon = "",
        extraClasses = "",
        type = "text",
        autocomplete = "on",
        onchange,
        oninput,
        onfocusin,
        onfocusout
    }: Props = $props();

    const uid = $props.id();
    const inputId = $derived(id ?? `text-field-${uid}`);

    function typeAction(node: HTMLInputElement) {
        node.type = type;
    }
</script>

<div>
    {#if label.length}
        <label for={inputId} class="block text-sm font-medium pb-1">
            {label}
        </label>
    {/if}
    <div class="flex items-center gap-2">
        {#if icon.length > 0}
            <div class="w-6">
                <i class="fa fa-{icon}"></i>
            </div>
        {/if}
        <input
            id={inputId}
            {name}
            class="bg-input-background border border-input-border rounded-md min-h-11 sm:min-h-9 px-3 py-2 sm:py-1.5 leading-5 transition-colors focus:border-input-border-focus focus:outline-none focus:ring-0 min-w-0 w-full {extraClasses}"
            class:border-red-400={(error?.length ?? 0) > 0}
            class:bg-input-background-error={(error?.length ?? 0) > 0}
            class:text-gray-500={disabled}
            {disabled}
            {autocomplete}
            use:typeAction
            bind:value
            {onchange}
            {oninput}
            {onfocusin}
            {onfocusout}
            {placeholder}
        />
    </div>

    {#if error}
        <span class="textfield-error text-xs text-red-400">
            {translateValidationError(error, $_)}
        </span>
    {/if}
</div>

<style>
    :global(input[type="search"]::-webkit-search-cancel-button) {
        -webkit-appearance: none;
        appearance: none;
    }
</style>
