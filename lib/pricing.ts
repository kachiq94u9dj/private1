// Claude モデル料金表（1Mトークンあたりのドル）。
// 参照: https://www.anthropic.com/pricing（変動する可能性があるため、実際の請求と差異があれば
// このファイルの数値を更新してください）
//
// キャッシュ書き込み(5分TTL) ≈ 入力単価 × 1.25、キャッシュ読み込み ≈ 入力単価 × 0.1
// という Anthropic の一般的な料率をどのモデルにも適用しています。

export interface ModelPricing {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // 現行モデル
  "claude-fable-5": { input: 10.0, output: 50.0 },
  "claude-mythos-5": { input: 10.0, output: 50.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },

  // 旧世代（参考値。過去ログ解析用）
  "claude-opus-4-5": { input: 5.0, output: 25.0 },
  "claude-opus-4-1": { input: 15.0, output: 75.0 },
  "claude-opus-4-0": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-0": { input: 3.0, output: 15.0 },
  "claude-3-7-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;
const DEFAULT_PRICING: ModelPricing = { input: 3.0, output: 15.0 };

/** モデルIDの日付サフィックス(-20251101等)を取り除き、価格表のキーに正規化する */
export function normalizeModelId(modelId: string): string {
  return modelId.replace(/-\d{8}$/, "");
}

export function getModelPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[normalizeModelId(modelId)] ?? DEFAULT_PRICING;
}

export function estimateCostUsd(
  modelId: string,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  },
): number {
  const pricing = getModelPricing(modelId);
  const cost =
    (tokens.inputTokens * pricing.input +
      tokens.outputTokens * pricing.output +
      tokens.cacheCreationTokens * pricing.input * CACHE_WRITE_MULTIPLIER +
      tokens.cacheReadTokens * pricing.input * CACHE_READ_MULTIPLIER) /
    1_000_000;
  return Math.round(cost * 10000) / 10000;
}
