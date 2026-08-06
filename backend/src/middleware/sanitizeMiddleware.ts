import type { Request, Response, NextFunction } from 'express';

// AMX-12: strip MongoDB operator keys from request input (defense-in-depth against
// NoSQL operator injection, e.g. { "email": { "$gt": "" } }).
//
// We do NOT use express-mongo-sanitize: its middleware reassigns `req.query`, which throws
// on Express 5 (`req.query` is a getter-only property). This mutates objects in place instead,
// which is Express-5-safe. Must be mounted AFTER the body parser so `req.body` is populated.
function stripOperatorKeys(obj: unknown, depth = 0): void {
    if (depth > 20 || obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        for (const item of obj) stripOperatorKeys(item, depth + 1);
        return;
    }
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        // `$`-prefixed keys are query operators; `.`-containing keys allow dotted-path injection.
        if (key.startsWith('$') || key.includes('.')) {
            delete (obj as Record<string, unknown>)[key];
        } else {
            stripOperatorKeys((obj as Record<string, unknown>)[key], depth + 1);
        }
    }
}

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body) stripOperatorKeys(req.body);
    if (req.params) stripOperatorKeys(req.params);
    // req.query is getter-only in Express 5 — mutate the returned object in place, never reassign.
    try {
        if (req.query) stripOperatorKeys(req.query as Record<string, unknown>);
    } catch {
        /* query is best-effort; body/params are the primary vector */
    }
    next();
};
