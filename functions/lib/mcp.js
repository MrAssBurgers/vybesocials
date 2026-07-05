/**
 * VYBE MCP endpoint — Streamable HTTP transport for external AI agents
 * (ChatGPT, Claude, Cursor, Codex) to call VYBE tools as the signed-in user.
 *
 * Auth: Firebase ID token in `Authorization: Bearer <token>`. No OAuth flow —
 * clients paste a short-lived ID token. Rotate by re-signing in.
 *
 * Endpoint: https://<region>-vybe-daaab.cloudfunctions.net/mcp
 * (or the hosting rewrite if configured).
 */
import { onRequest } from 'firebase-functions/v2/https';
import { db, auth } from './_shared/admin.js';
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'vybe-mcp', title: 'VYBE MCP', version: '0.1.0' };
const TOOLS = [
    {
        name: 'whoami',
        title: 'Who am I',
        description: 'Return the signed-in user\'s VYBE profile (uid, username, display name).',
        inputSchema: { type: 'object', properties: {} },
        handler: async (_input, uid) => {
            const snap = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
            if (snap.empty)
                return { uid, profile: null };
            const p = snap.docs[0].data();
            return {
                uid,
                profile_id: snap.docs[0].id,
                username: p.username ?? null,
                display_name: p.display_name ?? null,
                bio: p.bio ?? null,
            };
        },
    },
    {
        name: 'get_profile',
        title: 'Get profile',
        description: 'Fetch a public VYBE profile by username.',
        inputSchema: {
            type: 'object',
            properties: { username: { type: 'string', description: 'Username without @' } },
            required: ['username'],
        },
        handler: async (input) => {
            const username = String(input.username ?? '').trim().toLowerCase();
            if (!username)
                throw new Error('username required');
            const snap = await db.collection('profiles')
                .where('username', '==', username).limit(1).get();
            if (snap.empty)
                return { found: false };
            const p = snap.docs[0].data();
            return {
                found: true,
                profile_id: snap.docs[0].id,
                username: p.username,
                display_name: p.display_name ?? null,
                bio: p.bio ?? null,
                follower_count: p.follower_count ?? 0,
            };
        },
    },
    {
        name: 'list_my_recent_posts',
        title: 'List my recent posts',
        description: 'List the signed-in user\'s most recent posts (up to 20).',
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', description: '1-20', default: 10 } },
        },
        handler: async (input, uid) => {
            const limit = Math.min(20, Math.max(1, Number(input.limit ?? 10)));
            const snap = await db.collection('posts')
                .where('user_id', '==', uid)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .get();
            return {
                posts: snap.docs.map((d) => {
                    const x = d.data();
                    return {
                        id: d.id,
                        caption: x.caption ?? '',
                        media_type: x.media_type ?? null,
                        created_at: x.created_at?.toDate?.().toISOString?.() ?? null,
                        like_count: x.like_count ?? 0,
                        comment_count: x.comment_count ?? 0,
                    };
                }),
            };
        },
    },
    {
        name: 'list_my_notifications',
        title: 'List my notifications',
        description: 'Return the signed-in user\'s unread notifications (most recent first).',
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', default: 10 } },
        },
        handler: async (input, uid) => {
            const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)));
            const snap = await db.collection('notifications')
                .where('recipient_id', '==', uid)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .get();
            return {
                notifications: snap.docs.map((d) => {
                    const x = d.data();
                    return {
                        id: d.id,
                        type: x.type ?? null,
                        title: x.title ?? null,
                        body: x.body ?? null,
                        read: x.read ?? false,
                        created_at: x.created_at?.toDate?.().toISOString?.() ?? null,
                    };
                }),
            };
        },
    },
];
function rpcResult(id, result) {
    return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
async function handleRpc(msg, uid) {
    switch (msg.method) {
        case 'initialize':
            return rpcResult(msg.id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO,
            });
        case 'notifications/initialized':
        case 'notifications/cancelled':
            return null; // notifications have no response
        case 'ping':
            return rpcResult(msg.id, {});
        case 'tools/list':
            return rpcResult(msg.id, {
                tools: TOOLS.map((t) => ({
                    name: t.name,
                    title: t.title,
                    description: t.description,
                    inputSchema: t.inputSchema,
                })),
            });
        case 'tools/call': {
            if (!uid)
                return rpcError(msg.id, -32001, 'Authentication required');
            const params = (msg.params ?? {});
            const tool = TOOLS.find((t) => t.name === params.name);
            if (!tool)
                return rpcError(msg.id, -32602, `Unknown tool: ${params.name}`);
            try {
                const output = await tool.handler(params.arguments ?? {}, uid);
                return rpcResult(msg.id, {
                    content: [{ type: 'text', text: JSON.stringify(output) }],
                    structuredContent: output,
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : 'Tool error';
                return rpcResult(msg.id, {
                    content: [{ type: 'text', text: message }],
                    isError: true,
                });
            }
        }
        default:
            return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
}
async function verifyBearer(header) {
    if (!header)
        return null;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m)
        return null;
    try {
        const decoded = await auth.verifyIdToken(m[1].trim());
        return decoded.uid;
    }
    catch {
        return null;
    }
}
export const mcp = onRequest({ cors: true, region: 'us-central1', invoker: 'public' }, async (req, res) => {
    // CORS is auto-added by onRequest({cors:true}) but ensure MCP-required Accept works.
    if (req.method === 'GET') {
        // Streamable HTTP: a GET can be used for server-initiated messages via SSE.
        // We don't push server events, so respond 405 as spec allows.
        res.status(405).json({ error: 'Method Not Allowed. Use POST with JSON-RPC.' });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }
    const uid = await verifyBearer(req.header('authorization'));
    const body = req.body;
    if (!body) {
        res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        return;
    }
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];
    for (const m of messages) {
        const r = await handleRpc(m, uid);
        if (r !== null)
            responses.push(r);
    }
    // If everything was a notification, spec requires 202 Accepted with no body.
    if (responses.length === 0) {
        res.status(202).end();
        return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(Array.isArray(body) ? responses : responses[0]);
});
//# sourceMappingURL=mcp.js.map