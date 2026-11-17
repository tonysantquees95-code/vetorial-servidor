// Chaves do Gemini em ordem: a principal (GEMINI_API_KEY) e as reservas (GEMINI_API_KEY_2, _3).
// Só passa para a próxima quando a anterior falha por limite, chave inválida/vencida ou queda.
export const chavesGemini = (env) => ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"].map((n) => env[n]).filter(Boolean);
export const trocaDeChave = (status) => status === 429 || status === 401 || status === 403 || status >= 500;
