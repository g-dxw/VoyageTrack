<script>
    import { page } from "$app/state";
    import errorDark from "$lib/assets/svgs/empty_states/error_dark.svg";
    import errorLight from "$lib/assets/svgs/empty_states/error_light.svg";
    import { theme } from "$lib/stores/theme_store";
    import { _ } from "svelte-i18n";

    const message = $derived(
        page.status === 404 ? $_("error-not-found") :
        page.status === 401 ? $_("error-sign-in-required") :
        page.status === 403 ? $_("error-forbidden") :
        page.status === 400 ? $_("error-invalid-request") :
        page.status >= 500 ? $_("error-unexpected") : page.error?.message,
    );
</script>

<svelte:head>
    <title>{page.status} | wanderer</title>
</svelte:head>
<div
    class="m-auto text-center max-w-md"
    style="height: calc(100dvh - 120px); font-size: 4rem"
>
    <img
        class="aspect-square rounded-xl mx-auto"
        width="300"
        src={$theme === "light" ? errorLight : errorDark}
        alt={$_("error-illustration")}
    />
    <div class="text-center mt-8">
        <h1 class="font-bold" style="line-height: 4rem;">
            {page.status}
        </h1>
        <p class="text-lg text-center mt-2">
            {message}
        </p>
    </div>
</div>
