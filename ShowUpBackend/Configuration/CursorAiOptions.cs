namespace ShowUpBackend.Configuration;

public class CursorAiOptions
{
    public const string SectionName = "Cursor";

    /// <summary>Loaded from CURSOR_API_KEY. Never expose to clients.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// OpenAI-compatible API base (e.g. local Cursor bridge, or https://api.cursor.com/v1 if available).
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.cursor.com/v1";

    /// <summary>Path under BaseUrl for chat completions.</summary>
    public string ChatCompletionsPath { get; set; } = "/chat/completions";

    /// <summary>Cursor model id (e.g. composer-2.5). Configurable for cost control.</summary>
    public string Model { get; set; } = "composer-2.5";

    /// <summary>bearer (Authorization: Bearer) or basic (API key as Basic username).</summary>
    public string AuthMode { get; set; } = "bearer";

    public int TimeoutSeconds { get; set; } = 15;

    public int MaxQueryLength { get; set; } = 500;
}
