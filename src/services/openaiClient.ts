import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

export type StructuredOpenAIClient = ReturnType<typeof createOpenAIClient>;

export function createOpenAIClient(apiKey: string, fetchImpl?: typeof fetch) {
  return createOpenAI({ apiKey, fetch: fetchImpl });
}

export async function requestStructured<T extends z.ZodType>(
  client: StructuredOpenAIClient,
  model: string,
  system: string,
  user: string,
  schema: T,
  _name: string,
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model: client(model),
        system,
        prompt: user,
        maxRetries: 2,
        experimental_output: Output.object({
          schema: schema as z.ZodType,
        }),
      });
      return schema.parse(result.experimental_output);
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isStructuredOutputValidationError(error)) continue;
      logStructuredOutputError(_name, error);
      throw error;
    }
  }
  throw lastError;
}

function isStructuredOutputValidationError(error: unknown): boolean {
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!(cause instanceof Error) || !("cause" in cause)) return false;
  return (cause as Error & { cause?: unknown }).cause instanceof z.ZodError;
}

function logStructuredOutputError(name: string, error: unknown): void {
  const cause = error instanceof Error && "cause" in error
    ? (error as Error & { cause?: unknown }).cause
    : undefined;
  const validationError = cause instanceof Error && "cause" in cause
    ? (cause as Error & { cause?: unknown }).cause
    : undefined;

  console.error(`[structured-output-error] ${name}`, {
    error: describeError(error),
    cause: describeError(cause),
    validationError: describeError(validationError),
    issues: validationError instanceof z.ZodError ? validationError.issues : undefined,
  });
}

export function getUserFacingApiError(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "התקבלה תשובה שלא ניתן לקרוא. אפשר לנסות שוב.";
  }
  const rawMessage = getErrorMessage(error);
  if (rawMessage) {
    const message = rawMessage.toLowerCase();
    if (message === "multiple_proposals"
      || message === "unreadable_proposal"
      || message === "missing_property_id"
      || message === "property_not_found"
      || message === "invalid_recommendation") {
      return "לא ניתן להשלים את בדיקת ההצעה. בדקו את פרטי ההצעה ובקשת הלקוח ונסו שוב.";
    }
    if (message.includes("could not parse") || message.includes("could not parse response")) {
      return "המודל החזיר תשובה בפורמט לא תקין. אפשר לנסות שוב.";
    }
    if (message.includes("invalid schema") || message.includes("schema")) {
      return "המודל לא הצליח להחזיר תשובה בפורמט הנדרש. נסו שוב.";
    }
  }
  const message = rawMessage.toLowerCase();
  if (message.includes("api key") || message.includes("unauthorized") || message.includes("401")) {
    return "מפתח ה־API אינו תקין או שאין לו הרשאה.";
  }
  if (message.includes("rate limit") || message.includes("quota") || message.includes("429")) {
    return "מכסת השימוש הסתיימה או שקצב הבקשות גבוה מדי.";
  }
  if (message.includes("forbidden") || message.includes("403")) {
    return "החשבון אינו מורשה להשתמש במודל או ב־API מהדפדפן.";
  }
  if (message.includes("fetch failed") || message.includes("network") || message.includes("connection")) {
    return "החיבור ל־OpenAI נכשל לפני שהתקבלה תשובת HTTP. בדקו חסימת רשת, CORS או הרחבת דפדפן.";
  }
  if (rawMessage.toLowerCase().includes("timeout")) {
    return "הבקשה חרגה מזמן ההמתנה. אפשר לנסות שוב.";
  }
  return `אירעה שגיאה לא צפויה במהלך בדיקת ההצעה (${describeError(error)}).`;
}

export function describeError(error: unknown): string {
  const message = getErrorMessage(error);
  if (message) return message;
  if (error === null) return "null";
  if (error === undefined) return "undefined";
  if (typeof error === "object") {
    try {
      return JSON.stringify(error) || Object.prototype.toString.call(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}
