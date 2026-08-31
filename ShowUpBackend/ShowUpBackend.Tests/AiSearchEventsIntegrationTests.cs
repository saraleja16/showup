using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Services.Matchmaking;

namespace ShowUpBackend.Tests;

public class AiSearchWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "AiSearchTests_" + Guid.NewGuid();
    public IAiSearchService? AiSearchOverride { get; set; }
    public IGeocodingService? GeocodingOverride { get; set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");
        Environment.SetEnvironmentVariable("CURSOR_API_KEY", "");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<AppDbContext>));
            services.RemoveAll(typeof(AppDbContext));

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(DbName));

            services.RemoveAll<INotificationService>();
            services.AddSingleton<INotificationService, NoOpNotificationService>();

            services.RemoveAll<IGeocodingService>();
            services.AddSingleton<IGeocodingService>(GeocodingOverride ?? new StubGeocodingService());

            if (AiSearchOverride is not null)
            {
                services.RemoveAll<IAiSearchService>();
                services.AddSingleton(AiSearchOverride);
            }
        });
    }
}

/// <summary>
/// Deterministic stand-in for Cursor AI used only in tests.
/// </summary>
internal sealed class ScriptedAiSearchService : IAiSearchService
{
    private readonly MatchmakingOptions _options = new() { AbsoluteMaximumDistanceKm = 100 };

    public Task<(EventSearchFilters? Filters, string? Error)> ParseEventSearchQueryAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Task.FromResult<(EventSearchFilters?, string?)>((null, "Query is required."));

        if (query.Length > 500)
            return Task.FromResult<(EventSearchFilters?, string?)>((null, "Query must be at most 500 characters."));

        var raw = NaturalLanguageEventSearchParser.Parse(query);
        var filters = EventSearchFilterValidator.Validate(raw, _options);
        return Task.FromResult<(EventSearchFilters?, string?)>((filters, null));
    }
}

internal sealed class UnavailableAiSearchService : IAiSearchService
{
    public Task<(EventSearchFilters? Filters, string? Error)> ParseEventSearchQueryAsync(
        string query,
        CancellationToken cancellationToken = default)
        => Task.FromResult<(EventSearchFilters?, string?)>((null, "AI search is currently unavailable."));
}

public class AiSearchEventsIntegrationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Unauthenticated_search_is_rejected()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/ai/search-events", new { query = "Find tennis" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Find_tennis_within_5km_returns_filters_and_real_nearby_events()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        Guid nearId = Guid.Empty;
        Guid farId = Guid.Empty;

        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            nearId = Guid.NewGuid();
            farId = Guid.NewGuid();
            db.Events.Add(BuildEvent(nearId, meId, "tennis", "Beginner", -33.8690, 151.2095, DateTime.UtcNow.AddDays(1)));
            db.Events.Add(BuildEvent(farId, meId, "tennis", "Beginner", -34.5, 150.5, DateTime.UtcNow.AddDays(1)));
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "soccer", "Beginner", -33.8691, 151.2096, DateTime.UtcNow.AddDays(1)));
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "Find me tennis within 5 km" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal("tennis", body.InterpretedFilters.Sport);
        Assert.Equal(5, body.InterpretedFilters.RadiusKm);
        Assert.Contains(body.Events, e => e.Id == nearId);
        Assert.DoesNotContain(body.Events, e => e.Id == farId);
        Assert.All(body.Events, e => Assert.Equal("tennis", e.Sport));
        Assert.DoesNotContain(body.Events, e => e.Title.StartsWith("FAKE_"));
    }

    [Fact]
    public async Task Beginner_soccer_tomorrow_evening_within_10km()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        var tomorrowEvening = DateTime.UtcNow.Date.AddDays(1).AddHours(18);
        Guid matchId = Guid.Empty;

        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            matchId = Guid.NewGuid();
            db.Events.Add(BuildEvent(matchId, meId, "soccer", "Beginner", -33.8690, 151.2095, tomorrowEvening));
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "soccer", "Advanced", -33.8690, 151.2095, tomorrowEvening));
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "soccer", "Beginner", -33.8690, 151.2095, tomorrowEvening.Date.AddHours(10)));
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "Beginner soccer tomorrow evening within 10 km" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal("soccer", body.InterpretedFilters.Sport);
        Assert.Equal(10, body.InterpretedFilters.RadiusKm);
        Assert.Equal("Beginner", body.InterpretedFilters.SkillLevel);
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(1)).ToString("yyyy-MM-dd"), body.InterpretedFilters.Date);
        Assert.Equal("17:00", body.InterpretedFilters.StartTime);
        Assert.Equal("22:00", body.InterpretedFilters.EndTime);
        Assert.Single(body.Events);
        Assert.Equal(matchId, body.Events[0].Id);
    }

    [Fact]
    public async Task Show_me_anything_nearby_uses_radius_without_sport()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "volleyball", null, -33.8690, 151.2095, DateTime.UtcNow.AddDays(2)));
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "Show me anything nearby" });
        var body = await response.Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Null(body.InterpretedFilters.Sport);
        Assert.Equal(50, body.InterpretedFilters.RadiusKm);
        Assert.NotEmpty(body.Events);
    }

    [Fact]
    public async Task Find_volleyball_filters_by_sport()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        Guid vbId = Guid.Empty;
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            vbId = Guid.NewGuid();
            db.Events.Add(BuildEvent(vbId, meId, "volleyball", null, -33.87, 151.21, DateTime.UtcNow.AddDays(3)));
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "tennis", null, -33.87, 151.21, DateTime.UtcNow.AddDays(3)));
            await db.SaveChangesAsync();
        });

        var body = await (await client.PostAsJsonAsync("/api/ai/search-events", new { query = "Find volleyball" }))
            .Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.Equal("volleyball", body!.InterpretedFilters.Sport);
        Assert.All(body.Events, e => Assert.Equal("volleyball", e.Sport));
        Assert.Contains(body.Events, e => e.Id == vbId);
    }

    [Fact]
    public async Task Very_long_query_is_rejected()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        var (client, _) = await SeedAndAuthAsync(factory);
        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = new string('x', 501) });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ai_unavailable_returns_clean_error_without_fake_events()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new UnavailableAiSearchService() };
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "tennis", null, -33.87, 151.21, DateTime.UtcNow.AddDays(1)));
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "Find tennis" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("AI search is currently unavailable", json);
        Assert.DoesNotContain("events", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Blank_cursor_key_real_service_returns_unavailable()
    {
        await using var factory = new AiSearchWebAppFactory(); // real AiSearchService, blank key
        var (client, _) = await SeedAndAuthAsync(factory);
        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "Find tennis within 5 km" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task No_matching_real_events_returns_empty_list()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new ScriptedAiSearchService() };
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "soccer", null, -33.87, 151.21, DateTime.UtcNow.AddDays(1)));
            await db.SaveChangesAsync();
        });

        var body = await (await client.PostAsJsonAsync("/api/ai/search-events", new { query = "Find volleyball" }))
            .Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal("volleyball", body.InterpretedFilters.Sport);
        Assert.Empty(body.Events);
    }

    [Fact]
    public async Task Manual_get_events_still_works()
    {
        await using var factory = new AiSearchWebAppFactory { AiSearchOverride = new UnavailableAiSearchService() };
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            db.Events.Add(BuildEvent(Guid.NewGuid(), meId, "tennis", null, -33.87, 151.21, DateTime.UtcNow.AddDays(1)));
            await db.SaveChangesAsync();
        });

        var response = await client.GetAsync("/api/events");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var events = await response.Content.ReadFromJsonAsync<List<EventDto>>(JsonOptions);
        Assert.NotNull(events);
        Assert.NotEmpty(events);
    }

    [Fact]
    public async Task AiSearchService_blank_key_does_not_crash()
    {
        var service = new AiSearchService(
            Options.Create(new CursorAiOptions { ApiKey = "" }),
            Options.Create(new MatchmakingOptions()),
            new EmptyHttpClientFactory(),
            LoggerFactory.Create(_ => { }).CreateLogger<AiSearchService>());

        var result = await service.ParseEventSearchQueryAsync("Find tennis");
        Assert.Null(result.Filters);
        Assert.Equal("AI search is currently unavailable.", result.Error);
    }

    private sealed class EmptyHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static async Task<(HttpClient Client, Guid UserId)> SeedAndAuthAsync(
        AiSearchWebAppFactory factory,
        Func<AppDbContext, Guid, Task>? seedExtra = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();

        var me = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Me",
            LastName = "User",
            DisplayName = "Me User",
            Username = "aiuser_" + Guid.NewGuid().ToString("N")[..8],
            Email = $"ai_{Guid.NewGuid():N}@example.com",
            PasswordHash = "hash",
            DateOfBirth = new DateOnly(1995, 1, 1),
            Sex = "unspecified",
            PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
            SkillLevel = "Intermediate",
            Latitude = -33.8688,
            Longitude = 151.2093,
            LocationUpdatedAt = DateTime.UtcNow,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(me);
        await db.SaveChangesAsync();

        if (seedExtra is not null)
            await seedExtra(db, me.Id);

        var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
        var token = tokens.CreateAccessToken(me);

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, me.Id);
    }

    private static Event BuildEvent(
        Guid id,
        Guid creatorId,
        string sport,
        string? skill,
        double lat,
        double lng,
        DateTime scheduledAt)
        => new()
        {
            Id = id,
            Title = $"{sport} game",
            Description = "real seeded event",
            CreatorId = creatorId,
            Sport = sport,
            RequiredSkillLevel = skill,
            Latitude = lat,
            Longitude = lng,
            ScheduledAt = DateTime.SpecifyKind(scheduledAt, DateTimeKind.Utc),
            MaxPlayers = 10,
            CreatedAt = DateTime.UtcNow
        };
}
