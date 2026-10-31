import { env } from "$env/dynamic/public";
import { env as private_env } from "$env/dynamic/private";

import { json, type RequestEvent } from "@sveltejs/kit";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { handleError } from "$lib/util/api_util";

const redirectURL = private_env.ORIGIN + "/login/redirect"

/**
 * @swagger
 * /api/v1/auth/oauth:
 *   get:
 *     summary: List OAuth providers
 *     description: Lists available OAuth2 authentication methods with provider images
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: OAuth2 providers and configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         description: Internal Server Error
 */
export async function GET(event: RequestEvent) {
    try {
        const r = await event.locals.pb.collection('users').listAuthMethods();

        for (const provider of r.oauth2.providers) {
            const imageURL = `${env.PUBLIC_POCKETBASE_URL}/_/images/oauth2/${provider.name.replace(/\s*\(\d+\)$/, '')}.svg`
            provider['img' as keyof typeof provider] = await imageUrlToBase64(imageURL, event.fetch);
            provider['url' as keyof typeof provider] = `${provider.authURL}${redirectURL}`
        }
        return json(r)
    } catch (e: any) {
        return handleError(e);
    }

}

export async function POST(event: RequestEvent) {
    try {
        const data = await event.request.json();
        const safeData = z.object({
            name: z.string().min(1),
            code: z.string().min(1),
            codeVerifier: z.string().min(1)
        }).parse(data)

        const r = await event.locals.pb.collection('users').authWithOAuth2Code(
            safeData.name,
            safeData.code,
            safeData.codeVerifier,
            redirectURL,
        )
        // The session cookie is still exported by hooks.server.ts. Upstream
        // OAuth metadata may contain IdP tokens and is not part of this API.
        return json({ token: r.token, record: r.record })
    } catch (e: unknown) {
        if (e instanceof z.ZodError || e instanceof SyntaxError) {
            return json({ message: "invalid_params" }, { status: 400 });
        }
        const status = e instanceof ClientResponseError && e.status >= 400 && e.status < 500
            ? e.status
            : 502;
        // Do not relay raw OAuth diagnostics, codes or claims to the browser.
        return json({ message: "oauth_authentication_failed" }, { status });
    }

}

async function imageUrlToBase64(url: string, f: (url: RequestInfo | URL, config?: RequestInit) => Promise<Response>) {
    try {
        const response = await f(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64DataUrl = `data:${response.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
        return base64DataUrl;
    } catch (error) {
        console.error('Error fetching image:', error);
        throw error;
    }
}
