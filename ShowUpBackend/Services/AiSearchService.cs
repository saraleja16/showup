using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Services.Matchmaking;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

/// <summary>
/// Converts NL search → structured filters. Uses Cursor chat when an OpenAI-compatible
/// endpoint exists; otherwise falls back to local parsing (official Cursor API has no
/// /v1/chat/completions). Never queries the database.
/// </summary>
public class AiSearchService : IAiSearchService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly CursorAiOptions _options;
    private readonly MatchmakingOptions _matchmakingOptions;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AiSearchService> _logger;

    public AiSearchService(
        IOptions<CursorAiOptions> options,
        IOptions<MatchmakingOptions> matchmakingOptions,
        IHttpClientFactory httpClientFactory,
        ILogger<AiSearchService> logger)
    {
        _options = options.Value;
        _matchmakingOptions = matchmakingOptions.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<(EventSearchFilters? Filters, string? Error)> ParseEventSearchQueryAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            return (null, "AI search is currently unavailable.");

        var trimmed = (query ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            return (null, "Query is required.");

        var maxLen = Math.Clamp(_options.MaxQueryLength, 1, 2000);
        if (trimmed.Length > maxLen)
            return (null, $"Query must be at most {maxLen} characters.");

        try
        {
            AiEventSearchFilterPayload? payload = null;

            // Official api.cursor.com has no chat completions route (404). Skip remote
            // call for that host and use local structured parsing instead.
            if (!IsOfficialCursorApiWithoutChat(_options.BaseUrl))
            {
                payload = await TryRemoteChatParseAsync(trimmed, cancellationToken);
            }

            payload ??= NaturalLanguageEventSearchParser.Parse(trimmed);

            var filters = EventSearchFilterValidator.Validate(payload, _matchmakingOptions);
            return (filters, null);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("AI event search timed out");
            var filters = EventSearchFilterValidator.Validate(
                NaturalLanguageEventSearchParser.Parse(trimmed), _matchmakingOptions);
            return (filters, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI event search failed; using local filter parser");
            var filters = EventSearchFilterValidator.Validate(
                NaturalLanguageEventSearchParser.Parse(trimmed), _matchmakingOptions);
            return (filters, null);
        }
    }

    private static bool IsOfficialCursorApiWithoutChat(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return true;
        try
        {
            var host = new Uri(baseUrl).Host;
            return host.Equals("api.cursor.com", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private async Task<AiEventSearchFilterPayload?> TryRemoteChatParseAsync(
        string trimmed,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var sports = string.Join(", ", SportCatalog.AllSportIds);
            var schemaHint =
                """
                {"intentType":"event|game|venue|eventCentre","sport":string|null,"radiusKm":number|null,"date":"yyyy-MM-dd"|null,"startTime":"HH:mm"|null,"endTime":"HH:mm"|null,"skillLevel":string|null,"locationQuery":string|null}
                """.Trim();

            var systemPrompt =
                "You convert ShowUp natural-language searches into structured filters. " +
                "Never generate SQL, coordinates, credentials, or database actions. " +
                "Return ONLY a single JSON object matching this shape (no markdown): " + schemaHint + " " +
                "intentType: event/game for matches & games; venue for courts/venues; eventCentre for sports centres. " +
                $"Valid sports (prefer exact ids): {sports}. " +
                $"Valid skill levels: {SkillLevels.Beginner}, {SkillLevels.Intermediate}, {SkillLevels.Advanced}. " +
                $"Today's UTC date is {today:yyyy-MM-dd}. " +
                "Put place names (city/suburb) in locationQuery only — never invent lat/lng. " +
                "Interpret relative dates (today/tomorrow/this weekend) as ISO yyyy-MM-dd. " +
                "Interpret evening as startTime 17:00 and endTime 22:00 unless the user specifies otherwise. " +
                "Interpret morning as 06:00-12:00 and afternoon as 12:00-17:00. " +
                "radiusKm must be a positive number in kilometers when distance is mentioned. " +
                "Use null for any field not clearly present in the user request.";

        var requestBody = new Dictionary<string, object?>
        {
            ["model"] = string.IsNullOrWhiteSpace(_options.Model) ? "composer-2.5" : _options.Model,
            ["temperature"] = 0,
            ["messages"] = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = trimmed }
            },
            ["response_format"] = new { type = "json_object" }
        };

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 3, 60)));

        var contentText = await SendChatAsync(requestBody, timeoutCts.Token);
        if (string.IsNullOrWhiteSpace(contentText))
            return null;

        var json = ExtractJsonObject(contentText);
        if (json is null)
            return null;

        try
        {
            return JsonSerializer.Deserialize<AiEventSearchFilterPayload>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<string?> SendChatAsync(Dictionary<string, object?> body, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("CursorAi");
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildCompletionsUri());
        ApplyAuth(request);

        var json = JsonSerializer.Serialize(body, JsonOptions);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            if (body.ContainsKey("response_format") &&
                (int)response.StatusCode is >= 400 and < 500)
            {
                body.Remove("response_format");
                using var retry = new HttpRequestMessage(HttpMethod.Post, BuildCompletionsUri());
                ApplyAuth(retry);
                retry.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
                using var retryResponse = await client.SendAsync(retry, cancellationToken);
                var retryText = await retryResponse.Content.ReadAsStringAsync(cancellationToken);
                if (!retryResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Cursor AI search HTTP {Status}", (int)retryResponse.StatusCode);
                    return null;
                }
                return ParseMessageContent(retryText);
            }

            _logger.LogWarning("Cursor AI search HTTP {Status}", (int)response.StatusCode);
            return null;
        }

        return ParseMessageContent(responseText);
    }

    private Uri BuildCompletionsUri()
    {
        var baseUrl = (_options.BaseUrl ?? "https://api.cursor.com/v1").TrimEnd('/');
        var path = string.IsNullOrWhiteSpace(_options.ChatCompletionsPath)
            ? "/chat/completions"
            : _options.ChatCompletionsPath.StartsWith('/')
                ? _options.ChatCompletionsPath
                : "/" + _options.ChatCompletionsPath;
        return new Uri(baseUrl + path);
    }

    private void ApplyAuth(HttpRequestMessage request)
    {
        var mode = (_options.AuthMode ?? "bearer").Trim().ToLowerInvariant();
        if (mode == "basic")
        {
            var token = Convert.ToBase64String(Encoding.UTF8.GetBytes(_options.ApiKey + ":"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", token);
        }
        else
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        }
    }

    private static string? ParseMessageContent(string responseText)
    {
        try
        {
            using var doc = JsonDocument.Parse(responseText);
            if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                choices.ValueKind == JsonValueKind.Array &&
                choices.GetArrayLength() > 0)
            {
                var message = choices[0].GetProperty("message");
                if (message.TryGetProperty("content", out var content))
                    return content.GetString();
            }

            if (doc.RootElement.TryGetProperty("output_text", out var outputText))
                return outputText.GetString();
            if (doc.RootElement.TryGetProperty("result", out var result) && result.ValueKind == JsonValueKind.String)
                return result.GetString();
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static string? ExtractJsonObject(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.StartsWith("```"))
        {
            var firstNl = trimmed.IndexOf('\n');
            if (firstNl > 0)
                trimmed = trimmed[(firstNl + 1)..];
            var fence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
            if (fence >= 0)
                trimmed = trimmed[..fence].Trim();
        }

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start < 0 || end <= start)
            return null;

        return trimmed[start..(end + 1)];
    }
}
