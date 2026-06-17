/** VYBE agent tool schema — keep in sync with src/lib/agent/agentToolSchema.ts */
export const AGENT_TOOL_NAME = 'vybe_agent_act';
export const AGENT_ACTION_TYPES = [
    'navigate',
    'apply_theme',
    'generate_theme',
    'widget_toggle',
    'widget_reorder',
];
export const THEME_PRESET_KEYS = [
    'classic',
    'midnight',
    'neon',
    'soft',
    'cyberpunk',
    'minimal',
];
export const AGENT_NAV_PATHS = [
    '/home',
    '/messages',
    '/messages/new',
    '/messages/requests',
    '/notifications',
    '/search',
    '/settings',
    '/profile',
    '/upload',
    '/clips',
    '/explore',
    '/VYBE-AI',
    '/vybe-dna',
    '/brief',
    '/map',
    '/sounds',
    '/market',
    '/community',
    '/events',
    '/watch',
    '/leaderboard',
];
export function buildVybeAgentActTool() {
    return {
        type: 'function',
        function: {
            name: AGENT_TOOL_NAME,
            description: 'Reply to the user and optionally control their VYBE app (navigation, theme, home widgets).',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Concise reply shown in chat' },
                    actions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: [...AGENT_ACTION_TYPES] },
                                path: { type: 'string' },
                                preset: { type: 'string', enum: [...THEME_PRESET_KEYS] },
                                prompt: { type: 'string' },
                                widget_id: { type: 'string' },
                                visible: { type: 'boolean' },
                                order: { type: 'array', items: { type: 'string' } },
                            },
                            required: ['type'],
                        },
                    },
                },
                required: ['message', 'actions'],
            },
        },
    };
}
export function parseAgentPlan(raw) {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object')
        return { message: 'Done!', actions: [] };
    const message = typeof obj.message === 'string'
        ? obj.message
        : 'Done!';
    const actions = Array.isArray(obj.actions)
        ? obj.actions.filter((a) => a && typeof a === 'object')
        : [];
    return { message, actions };
}
//# sourceMappingURL=agentToolSchema.js.map