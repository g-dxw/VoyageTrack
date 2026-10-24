<script module lang="ts">
    export type SelectItem = {
        text: string;
        value: any;
    };
</script>

<script lang="ts">
    import { _ } from "svelte-i18n";
    import { translateValidationError } from "$lib/util/validation_i18n";

    interface Props {
        name?: string;
        items?: SelectItem[];
        value?: any;
        label?: string;
        error?: string | string[] | null;
        disabled?: boolean;
        fullWidth?: boolean;
        onchange?: (value: any) => void
    }

    let {
        name = "",
        items = [],
        value = $bindable(items.at(0)?.value ?? ""),
        label = "",
        error = "",
        disabled = false,
        fullWidth = false,
        onchange
    }: Props = $props();

    const uid = $props.id();
    const inputId = `select-${uid}`;

    function onChange(target: any) {
        onchange?.(target?.value);
    }
</script>

<div>
    {#if label.length}
        <label for={inputId} class="block text-sm font-medium pb-1">
            {label}
        </label>
    {/if}
    <select
        id={inputId}
        {name}
        class="block max-w-full bg-input-background h-11 sm:h-9 px-3 border-r-8 border-transparent outline-1 outline-input-border rounded-md focus:outline-input-border-focus transition-colors"
        class:w-full={fullWidth}
        class:outline-red-400={(error?.length ?? 0) > 0}
        class:bg-input-background-error={(error?.length ?? 0) > 0}
        class:text-gray-500={disabled}
        {disabled}
        bind:value
        onchange={(e) => onChange(e.target)}
    >
        {#each items as item}
            <option value={item.value}>{item.text}</option>
        {/each}
    </select>

    {#if error}
        <span class="select-error text-xs text-red-400">
            {translateValidationError(error, $_)}
        </span>
    {/if}
</div>
