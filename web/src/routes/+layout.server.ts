// +layout.ts
import '$lib/i18n';
import type { LayoutServerLoad } from './$types';
import { env } from "$env/dynamic/private";
import type { Settings } from '$lib/models/settings';
import { notifications_index } from '$lib/stores/notification_store';
import type { AuthRecord } from 'pocketbase';
import { homepageEditorPermission } from '$lib/server/homepage_admin';

export const load: LayoutServerLoad = async ({ locals, url, fetch }) => {

	let homepageEditorUserID: string | null = null;
	if (locals.user?.id && locals.pb.authStore.isValid) {
		try {
			if (await homepageEditorPermission(locals.pb)) homepageEditorUserID = locals.user.id;
		} catch {
			// A permission service failure hides only this optional navigation entry.
		}
	}
	let notifications
	if (locals.user?.id) {
		notifications = await notifications_index({ recipient: locals.user.actor }, 1, 10, fetch);
	}
	return { settings: locals.settings as Settings, user: locals.user as AuthRecord, notifications, origin: env.ORIGIN, homepageEditorUserID }
}