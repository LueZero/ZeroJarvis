import type { PolishResult } from "@zerojarvis/shared";
import { getClient } from "../llm/client.js";

/**
 * LLM-1: Polish raw STT text via OpenCode
 * - Fix STT errors
 * - Remove filler words
 * - Add punctuation
 * - Split multiple intents
 */

const POLISH_SYSTEM = `你是語音輸入整理助手。使用者用口語說了一段話，請你：

1. 修正 STT 可能的錯字（根據上下文推斷）
2. 去除口頭禪（呃、那個、就是、嗯、啊、對）
3. 加上適當的標點符號
4. 如果包含多個指令，分成編號清單
5. 保持原意，不要添加使用者沒說的內容
6. 使用繁體中文

回覆嚴格 JSON 格式：
{
  "polished": "整理後的文字",
  "corrections": ["原文→修正"],
  "confidence": 0.0到1.0的數字
}`;

// Dedicated polish session (short-lived, no context needed)
let polishSessionId: string | null = null;

export async function polish(rawText: string): Promise<PolishResult> {
  try {
    const client = await getClient();

    // Create a fresh session each time for polish (no context bleed)
    const session = await client.session.create({
      body: { title: "Polish" },
    });
    polishSessionId = session.data!.id;

    const result = await client.session.prompt({
      path: { id: polishSessionId },
      body: {
        system: POLISH_SYSTEM,
        parts: [{ type: "text", text: `語音原文：「${rawText}」` }] as any,
      },
    });

    // Clean up polish session
    await client.session.delete({ path: { id: polishSessionId } }).catch(() => {});
    polishSessionId = null;

    // Extract text from response
    const responseParts = result.data?.parts || [];
    let responseText = "";
    for (const part of responseParts) {
      if ((part as any).type === "text") {
        responseText += (part as any).text;
      }
    }

    // Parse JSON from response
    // Try to extract JSON from the response (LLM might wrap it in markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        polished?: string;
        corrections?: string[];
        confidence?: number;
      };
      return {
        raw: rawText,
        polished: parsed.polished || rawText,
        corrections: parsed.corrections || [],
        confidence: parsed.confidence || 0.5,
      };
    }

    // If no JSON found, return the response as polished text
    return {
      raw: rawText,
      polished: responseText.trim() || rawText,
      corrections: [],
      confidence: 0.5,
    };
  } catch (err) {
    console.error("OpenCode polish error:", err);
    return { raw: rawText, polished: rawText, corrections: [], confidence: 0.5 };
  }
}
