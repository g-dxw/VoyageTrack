<script lang="ts">
    import { createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();

    interface Props {
        label?: string;
        name?: string;
        accept?: string;
        files?: FileList | null;
    }

    let {
        label = "",
        name = "",
        accept = "*",
        files = $bindable(null)
    }: Props = $props();

    const uid = $props.id();
    const inputId = `file-input-${uid}`;
</script>

<div>
    {#if label.length}
        <label for={inputId} class="text-sm font-medium pb-1">
            {label}
        </label>
    {/if}
    <input
        {name}
        {accept}
        bind:files
        id={inputId}
        class="cursor-pointer bg-input-background border border-input-border rounded-md min-h-11 sm:min-h-9 p-1 leading-5 transition-colors focus:border-input-border-focus focus:outline-none focus:ring-0 w-full file:rounded-md file:px-3 file:py-1 sm:file:py-0.5 file:border file:border-input-border-focus file:font-medium file:mr-3"
        type="file"
        onchange={bubble('change')}
    />
</div>
